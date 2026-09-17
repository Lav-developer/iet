import { Prisma } from "@prisma/client";
import { databaseConfigured, getPrisma } from "@/lib/db";
import { isProduction } from "@/lib/config";

const localBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Shared identity used when no trusted client address can be established.
 * All such requests are pooled into a single (coarser) rate-limit bucket per
 * scope — deliberately fail-closed: without a verified proxy chain the
 * application never grants per-attacker buckets from client-supplied headers.
 */
export const DIRECT_CLIENT_KEY = "direct";

/* ------------------------------------------------------------------ */
/* Trusted client IP derivation                                        */
/* ------------------------------------------------------------------ */

type ParsedCidr = { network: bigint; mask: bigint; isV6: boolean };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function ipv6ToInt(ip: string): bigint | null {
  // Expand "::" into a full 8-group representation.
  let address = ip;
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  let halves: string[] | null = null;
  if (address.includes("::")) {
    if (address.split("::").length !== 2) return null;
    halves = address.split("::");
  }
  const groups: string[] = [];
  const pushSide = (side: string, into: string[]) => {
    if (side === "") return;
    const parts = side.split(":");
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return;
      into.push(part);
    }
  };
  if (halves) {
    const left: string[] = [];
    const right: string[] = [];
    pushSide(halves[0], left);
    pushSide(halves[1], right);
    if (left.length > 8 || right.length > 8 || left.length + right.length > 8) return null;
    const fill = Array.from({ length: 8 - left.length - right.length }, () => "0");
    groups.push(...left, ...fill, ...right);
  } else {
    const parts = address.split(":");
    if (parts.length !== 8) return null;
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(part);
    }
  }
  let value = BigInt(0);
  for (const group of groups) {
    value = (value << BigInt(16)) | BigInt(parseInt(group, 16));
  }
  return value;
}

function ipToBigInt(ip: string): { value: bigint; isV6: boolean } | null {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return { value: BigInt(v4), isV6: false };
  const v6 = ipv6ToInt(ip);
  if (v6 !== null) return { value: v6, isV6: true };
  return null;
}

function parseCidrs(raw: string | undefined): ParsedCidr[] {
  if (!raw) return [];
  const result: ParsedCidr[] = [];
  for (const entry of raw.split(",")) {
    const cidr = entry.trim();
    if (!cidr) continue;
    const [addr, bitsRaw] = cidr.split("/");
    const parsed = ipToBigInt(addr);
    if (!parsed) continue;
    const bits = bitsRaw === undefined ? (parsed.isV6 ? 128 : 32) : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > (parsed.isV6 ? 128 : 32)) continue;
    const width = parsed.isV6 ? BigInt(128) : BigInt(32);
    const mask = bits === 0 ? BigInt(0) : ((BigInt(1) << width) - BigInt(1)) ^ ((BigInt(1) << BigInt(width - BigInt(bits))) - BigInt(1));
    result.push({ network: parsed.value & mask, mask, isV6: parsed.isV6 });
  }
  return result;
}

function ipInCidrs(ip: string, cidrs: ParsedCidr[]): boolean {
  const parsed = ipToBigInt(ip);
  if (!parsed) return false;
  for (const cidr of cidrs) {
    if (cidr.isV6 !== parsed.isV6) continue;
    if ((parsed.value & cidr.mask) === cidr.network) return true;
  }
  return false;
}

function readTrustedProxyConfig() {
  const countRaw = process.env.TRUSTED_PROXY_COUNT?.trim();
  const count = countRaw === undefined || countRaw === "" ? 0 : Number(countRaw);
  if (!Number.isInteger(count) || count < 0 || count > 32) return { count: 0, cidrs: [] as ParsedCidr[] };
  return { count, cidrs: parseCidrs(process.env.TRUSTED_PROXY_CIDRS) };
}

/**
 * Derive the client address for rate limiting, audit logging and login
 * protection. Deployment-safe strategy:
 *
 * - `TRUSTED_PROXY_COUNT` = number of trusted reverse proxies/load balancers
 *   in front of the application (each must APPEND the peer address to the
 *   X-Forwarded-For chain, e.g. nginx `$proxy_add_x_forwarded_for`,
 *   AWS ALB, HAProxy `X-Forwarded-For append`).
 * - `TRUSTED_PROXY_CIDRS` (optional but recommended) = comma-separated CIDRs
 *   covering the trusted proxies; used to verify the trusted region of the
 *   chain.
 *
 * When a trusted proxy appends the true peer address to the right of any
 * client-forged prefix, the client address is deterministically the entry at
 * index `length - TRUSTED_PROXY_COUNT` — rotating forged left-hand entries
 * never changes that hop. If the chain is missing, too short, malformed, or
 * its trusted region fails CIDR verification, the request is pooled into the
 * shared `direct` bucket instead of being granted a header-derived identity.
 * `X-Real-IP` is never trusted. With no trusted proxy configured
 * (`TRUSTED_PROXY_COUNT` unset/0) no forwarded header is ever consulted.
 */
export function trustedClientIp(request: Request): string {
  const { count, cidrs } = readTrustedProxyConfig();
  if (count === 0) return DIRECT_CLIENT_KEY;
  const header = request.headers.get("x-forwarded-for");
  if (!header) return DIRECT_CLIENT_KEY;
  const hops = header.split(",").map((hop) => hop.trim()).filter(Boolean);
  if (hops.length < count) return DIRECT_CLIENT_KEY;
  const client = hops[hops.length - count];
  if (!ipToBigInt(client)) return DIRECT_CLIENT_KEY;
  // The client must not look like one of our own trusted proxies.
  if (cidrs.length > 0 && ipInCidrs(client, cidrs)) return DIRECT_CLIENT_KEY;
  if (count > 1) {
    const trustedRegion = hops.slice(hops.length - (count - 1));
    if (cidrs.length > 0 && !trustedRegion.every((hop) => ipInCidrs(hop, cidrs))) return DIRECT_CLIENT_KEY;
  }
  return client;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return !isProduction;
  try {
    const requestHost = request.headers.get("host");
    const candidate = origin || referer;
    return candidate ? new URL(candidate).host === requestHost : false;
  } catch {
    return false;
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; count: number };

/**
 * Shared-store rate limiter. PostgreSQL is used when configured so limits are
 * consistent across multiple application instances. The Map fallback is only
 * for local development and is never used in production.
 *
 * The identity defaults to `trustedClientIp(request)` — see that function for
 * the proxy configuration contract.
 */
export async function consumeRateLimit(request: Request, scope: string, limit: number, windowMs: number, identity?: string): Promise<RateLimitResult> {
  const key = `${scope}:${identity || trustedClientIp(request)}`;
  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000), count: limit + 1 };
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, NOW())
      ON CONFLICT ("key") DO UPDATE
      SET "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
          "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END,
          "updatedAt" = NOW()
      RETURNING "count", "resetAt"
    `);
    const row = rows[0];
    if (!row) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000), count: limit + 1 };
    // Opportunistic housekeeping: expired buckets are pruned with low
    // probability on each access so RateLimitBucket does not grow unbounded
    // without an external cron job.
    if (Math.random() < 0.01) {
      await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now) } } }).catch(() => undefined);
    }
    return { allowed: row.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now) / 1000)), count: row.count };
  }

  if (isProduction) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000), count: limit + 1 };
  if (localBuckets.size > 10000) for (const [bucketKey, bucket] of localBuckets) if (bucket.resetAt <= now) localBuckets.delete(bucketKey);
  const current = localBuckets.get(key);
  if (!current || current.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000), count: 1 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)), count: current.count };
}

export async function clearRateLimit(scope: string, identity: string) {
  const key = `${scope}:${identity}`;
  localBuckets.delete(key);
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (prisma) await prisma.rateLimitBucket.deleteMany({ where: { key } });
  }
}

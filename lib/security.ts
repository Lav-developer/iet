import { Prisma } from "@prisma/client";
import { databaseConfigured, getPrisma } from "@/lib/db";
import { isProduction } from "@/lib/config";

const localBuckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
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

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Shared-store rate limiter. PostgreSQL is used when configured so limits are
 * consistent across multiple application instances. The Map fallback is only
 * for local development and is never used in production.
 */
export async function consumeRateLimit(request: Request, scope: string, limit: number, windowMs: number, identity?: string): Promise<RateLimitResult> {
  const key = `${scope}:${identity || clientKey(request)}`;
  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
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
    if (!row) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    return { allowed: row.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now) / 1000)) };
  }

  if (isProduction) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  if (localBuckets.size > 10000) for (const [bucketKey, bucket] of localBuckets) if (bucket.resetAt <= now) localBuckets.delete(bucketKey);
  const current = localBuckets.get(key);
  if (!current || current.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export async function clearRateLimit(scope: string, identity: string) {
  const key = `${scope}:${identity}`;
  localBuckets.delete(key);
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (prisma) await prisma.rateLimitBucket.deleteMany({ where: { key } });
  }
}

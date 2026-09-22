import test, { before } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * End-to-end check of the users API handlers (POST / PATCH / DELETE) for the
 * reported problem: "IET admin is able to change super admin role and new
 * password". The real route module runs with a real signed session cookie; only
 * the database client is replaced by an in-memory stand-in injected through the
 * same global the app uses, so the handlers' authorization, hashing and audit
 * paths are the production code paths. No database is contacted.
 */

// Next's request scope (what `cookies()` reads) is an AsyncLocalStorage that the
// server runtime normally installs on globalThis; the test installs it the same way.
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
// Marks the database as configured; the injected client below means nothing ever connects.
process.env.DATABASE_URL = "postgresql://never-connected.invalid/iet";

type Row = { id: string; email: string; name: string; role: string; departmentId: string | null; active: boolean; sessionVersion: number; passwordHash: string };
type Where = { id?: string; email?: string };
type UpdateData = Record<string, unknown> & { sessionVersion?: { increment: number } };

const rows = new Map<string, Row>();
const calls: string[] = [];
const row = (id: string, role: string, active = true): Row => ({ id, email: `${id}@iet.test`, name: id, role, departmentId: null, active, sessionVersion: 0, passwordHash: `hash-${id}` });
const reset = () => {
  rows.clear();
  for (const r of [row("u-super", "SUPER_ADMIN"), row("u-super-2", "SUPER_ADMIN"), row("u-iet", "IET_ADMIN"), row("u-iet-2", "IET_ADMIN"), row("u-editor", "EDITOR")]) rows.set(r.id, r);
  calls.length = 0;
};

const pick = (source: Row, select?: Record<string, boolean>) => {
  if (!select) return { ...source };
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, source[key as keyof Row]]));
};

// What the route's transaction callback uses; annotated so the stand-in's type is not self-referential.
type Tx = { user: { create: (args: never) => Promise<unknown>; update: (args: never) => Promise<unknown> }; auditLog: { create: (args: never) => Promise<unknown> } };

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: Where }) => (where.id ? rows.get(where.id) : [...rows.values()].find((r) => r.email === where.email)) ?? null,
    findMany: async () => [...rows.values()],
    count: async () => rows.size,
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      calls.push("user.create");
      const created: Row = { ...row(String(data.email).split("@")[0], String(data.role)), ...(data as Partial<Row>), id: `created-${rows.size}` };
      rows.set(created.id, created);
      return pick(created, select);
    },
    update: async ({ where, data, select }: { where: Where; data: UpdateData; select?: Record<string, boolean> }) => {
      calls.push(`user.update:${where.id}`);
      const current = rows.get(String(where.id));
      if (!current) throw new Error("not found");
      const next: Row = { ...current };
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        if (key === "sessionVersion") next.sessionVersion += (value as { increment: number }).increment;
        else (next as unknown as Record<string, unknown>)[key] = value;
      }
      rows.set(next.id, next);
      return pick(next, select);
    },
  },
  auditLog: { create: async ({ data }: { data: { action: string; entityId: string; userId: string } }) => { calls.push(`audit:${data.action}:${data.entityId}:by:${data.userId}`); return data; } },
  department: { findUnique: async () => null },
  rateLimitBucket: { deleteMany: async () => ({ count: 0 }) },
  $queryRaw: async () => [{ count: 1, resetAt: new Date(Date.now() + 600_000) }],
  $transaction: async (fn: (tx: Tx) => Promise<unknown>): Promise<unknown> => { calls.push("$transaction"); return fn(fakePrisma as unknown as Tx); },
};

let handlers: { POST: (r: Request) => Promise<Response>; PATCH: (r: Request) => Promise<Response>; DELETE: (r: Request) => Promise<Response> };
let issueSessionToken: (user: { id: string; email: string; name: string; role: "SUPER_ADMIN" | "IET_ADMIN" | "DEPARTMENT_ADMIN" | "EDITOR"; sessionVersion: number }) => Promise<string>;
let RequestCookies: new (headers: Headers) => unknown;
let workUnitAsyncStorage: { run<T>(store: unknown, fn: () => T): T };
let workAsyncStorage: { run<T>(store: unknown, fn: () => T): T };

before(async () => {
  (globalThis as unknown as { prisma?: unknown }).prisma = fakePrisma;
  handlers = await import("../app/api/admin/users/route");
  ({ issueSessionToken } = await import("../lib/auth"));
  ({ RequestCookies } = await import("next/dist/server/web/spec-extension/cookies"));
  ({ workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external"));
  ({ workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external"));
});

/** Runs a handler the way Next does: inside a request scope carrying the session cookie. */
async function call(actorId: string | null, method: "POST" | "PATCH" | "DELETE", body: unknown) {
  const cookieHeader = actorId ? `iet_session=${await issueSessionToken({ id: actorId, email: `${actorId}@iet.test`, name: actorId, role: rows.get(actorId)!.role as "EDITOR", sessionVersion: rows.get(actorId)!.sessionVersion })}` : "";
  const request = new Request("https://iet.example.ac.in/api/admin/users", {
    method,
    headers: { "content-type": "application/json", origin: "https://iet.example.ac.in", host: "iet.example.ac.in", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
    body: JSON.stringify(body),
  });
  const unitStore = { type: "request", phase: "render", cookies: new RequestCookies(new Headers(cookieHeader ? { cookie: cookieHeader } : {})) };
  const workStore = { route: "/api/admin/users", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false };
  const response = await workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, () => handlers[method](request)));
  return { status: response.status, body: (await response.json()) as { error?: string; user?: Record<string, unknown> } };
}

const unchanged = (id: string, snapshot: Row) => assert.deepEqual(rows.get(id), snapshot, `${id} must be untouched`);
const noWrites = () => assert.deepEqual(calls.filter((c) => c !== "user.findUnique"), [], "nothing was written or audited");

test("PATCH — an IET administrator cannot set a new password on a super administrator (403, nothing written)", async () => {
  reset();
  const before = { ...rows.get("u-super")! };
  const { status, body } = await call("u-iet", "PATCH", { id: "u-super", data: { password: "New-Passw0rd!2026" } });
  assert.equal(status, 403);
  assert.match(body.error || "", /You cannot modify this administrator\. Only a super administrator can change a super administrator account\./);
  unchanged("u-super", before);
  noWrites();
});

test("PATCH — an IET administrator cannot change a super administrator's role, name or status (403, nothing written)", async () => {
  for (const data of [{ role: "IET_ADMIN" }, { role: "EDITOR", departmentId: null }, { name: "Renamed" }, { active: false }, { role: "SUPER_ADMIN", password: "New-Passw0rd!2026" }]) {
    reset();
    const before = { ...rows.get("u-super")! };
    const { status, body } = await call("u-iet", "PATCH", { id: "u-super", data });
    assert.equal(status, 403, JSON.stringify(data));
    assert.match(body.error || "", /Only a super administrator/);
    unchanged("u-super", before);
    noWrites();
  }
});

test("DELETE — an IET administrator cannot deactivate a super administrator", async () => {
  reset();
  const before = { ...rows.get("u-super")! };
  const { status, body } = await call("u-iet", "DELETE", { id: "u-super" });
  assert.equal(status, 403);
  assert.equal(body.error, "You cannot deactivate this account.");
  unchanged("u-super", before);
  noWrites();
});

test("PATCH / POST — an IET administrator cannot grant or create super administrator access", async () => {
  reset();
  const before = { ...rows.get("u-editor")! };
  const escalate = await call("u-iet", "PATCH", { id: "u-editor", data: { role: "SUPER_ADMIN" } });
  assert.equal(escalate.status, 403);
  assert.equal(escalate.body.error, "IET administrators cannot grant super administrator access.");
  unchanged("u-editor", before);
  noWrites();

  const create = await call("u-iet", "POST", { email: "new-super@iet.test", name: "New Super", password: "New-Passw0rd!2026", role: "SUPER_ADMIN" });
  assert.equal(create.status, 403);
  assert.equal(create.body.error, "IET administrators cannot create super administrators.");
  assert.equal(rows.size, 5);
  noWrites();
});

test("PATCH — control: the same IET administrator still resets an editor's password (200, sessions invalidated, audited)", async () => {
  reset();
  const { status, body } = await call("u-iet", "PATCH", { id: "u-editor", data: { name: "Editor Renamed", password: "New-Passw0rd!2026", role: "EDITOR", departmentId: null, active: true } });
  assert.equal(status, 200, body.error);
  const stored = rows.get("u-editor")!;
  assert.equal(stored.name, "Editor Renamed");
  assert.notEqual(stored.passwordHash, "hash-u-editor", "password hash replaced");
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/, "bcrypt cost 12");
  assert.equal(stored.sessionVersion, 1, "existing sessions invalidated");
  assert.deepEqual(calls, ["$transaction", "user.update:u-editor", "audit:UPDATED_AND_INVALIDATED_SESSIONS:u-editor:by:u-iet"]);
  assert.equal(body.user?.passwordHash, undefined, "the hash is never returned");
});

test("PATCH — a super administrator manages another super administrator, but not its own role", async () => {
  reset();
  const ok = await call("u-super", "PATCH", { id: "u-super-2", data: { password: "New-Passw0rd!2026", role: "IET_ADMIN", departmentId: null } });
  assert.equal(ok.status, 200, ok.body.error);
  assert.equal(rows.get("u-super-2")!.role, "IET_ADMIN");
  assert.equal(rows.get("u-super-2")!.sessionVersion, 1);

  calls.length = 0;
  const before = { ...rows.get("u-super")! };
  const self = await call("u-super", "PATCH", { id: "u-super", data: { role: "IET_ADMIN" } });
  assert.equal(self.status, 400);
  assert.equal(self.body.error, "You cannot change your own role. Ask a super administrator to change it.");
  unchanged("u-super", before);
  noWrites();
});

test("PATCH — no session and non-managing roles are refused before anything is read or written", async () => {
  reset();
  const anonymous = await call(null, "PATCH", { id: "u-super", data: { password: "New-Passw0rd!2026" } });
  assert.equal(anonymous.status, 401);
  const editor = await call("u-editor", "PATCH", { id: "u-super", data: { password: "New-Passw0rd!2026" } });
  assert.equal(editor.status, 403);
  assert.equal(editor.body.error, "Forbidden");
  noWrites();
});

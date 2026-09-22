import test, { before } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";

/**
 * The /admin workspace is protected on the server: app/admin/layout.tsx reads
 * the session with getSession() and redirects an unauthenticated visitor to
 * /admin/login before any admin page renders. The real layout component runs
 * here inside Next's request scope with (or without) a real signed session
 * cookie. No database is configured, so the development-only demo mode trusts
 * the signed token — the same getSession() code path the layout uses.
 *
 * This is a second layer only: every admin API route keeps its own
 * requireAdmin()/authorization checks (asserted below and in the RBAC tests).
 */

(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
// Development mode enables the demo session path; NODE_ENV is typed read-only, so it is set through the env record.
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
process.env.ALLOW_DEMO_AUTH = "true";
process.env.DEMO_ADMIN_EMAIL = "demo@iet.test";
process.env.DEMO_ADMIN_PASSWORD = "Demo-Passw0rd!";
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
delete process.env.DATABASE_URL;

type Role = "SUPER_ADMIN" | "IET_ADMIN" | "DEPARTMENT_ADMIN" | "EDITOR";
type Element = { type: unknown; props: { children?: unknown } };

let AdminLayout: (props: { children: React.ReactNode }) => Promise<unknown>;
let layoutModule: { dynamic?: string };
let AdminShell: unknown;
let issueSessionToken: (user: { id: string; email: string; name: string; role: Role; sessionVersion: number }) => Promise<string>;
let RequestCookies: new (headers: Headers) => unknown;
let workUnitAsyncStorage: { run<T>(store: unknown, fn: () => T): T };
let workAsyncStorage: { run<T>(store: unknown, fn: () => T): T };

before(async () => {
  layoutModule = await import("../app/admin/layout");
  AdminLayout = (layoutModule as unknown as { default: typeof AdminLayout }).default;
  ({ AdminShell } = await import("../components/admin-shell"));
  ({ issueSessionToken } = await import("../lib/auth"));
  ({ RequestCookies } = await import("next/dist/server/web/spec-extension/cookies"));
  ({ workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external"));
  ({ workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external"));
});

/** Renders the layout the way Next does: inside a request scope carrying the cookie header. */
function render(cookieHeader: string) {
  const unitStore = { type: "request", phase: "render", cookies: new RequestCookies(new Headers(cookieHeader ? { cookie: cookieHeader } : {})) };
  const workStore = { route: "/admin", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false };
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, () => AdminLayout({ children: "page" })));
}

test("an unauthenticated visitor to /admin is redirected to /admin/login before any page renders", async () => {
  await assert.rejects(render(""), (error: { digest?: string }) => {
    assert.match(error.digest || "", /^NEXT_REDIRECT;/);
    assert.match(error.digest || "", /;\/admin\/login;307;/);
    return true;
  });
  // A forged or tampered token is the same as no token.
  await assert.rejects(render("iet_session=not-a-valid-token"), (error: { digest?: string }) => /;\/admin\/login;/.test(error.digest || ""));
});

test("an authenticated administrator still reaches /admin: the page renders inside the workspace shell", async () => {
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"] as const) {
    const token = await issueSessionToken({ id: `u-${role}`, email: `${role.toLowerCase()}@iet.test`, name: role, role, sessionVersion: 0 });
    const element = (await render(`iet_session=${token}`)) as Element;
    assert.equal(element.type, AdminShell, `${role}: rendered through AdminShell`);
    assert.equal(element.props.children, "page", `${role}: the requested page is rendered`);
  }
});

test("the gate is the single server layout of /admin, rendered per request, and the sign-in page lives outside it", () => {
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/, "never prerendered: the cookie is read on every request");
  assert.match(layout, /const user = await getSession\(\);\s*if \(!user\) redirect\("\/admin\/login"\);/);
  assert.match(layout, /return <AdminShell>\{children\}<\/AdminShell>;/);
  assert.doesNotMatch(layout, /"use client"/, "the session check runs on the server");
  // No second, bypassable layout under /admin and no client-side exemption for the login route.
  assert.equal(existsSync("app/admin/(app)/layout.tsx"), false);
  assert.equal(existsSync("app/admin/login/page.tsx"), false, "the login page is not under the gated tree (it would redirect to itself)");
  assert.equal(existsSync("app/(auth)/admin/login/page.tsx"), true, "the login page still answers /admin/login");
  assert.doesNotMatch(readFileSync("components/admin-shell.tsx", "utf8"), /pathname === "\/admin\/login"/);
  // The API routes keep their own authorization: the layout is not the only guard.
  for (const route of ["app/api/admin/content/route.ts", "app/api/admin/media/upload/route.ts", "app/api/admin/users/route.ts", "app/api/admin/audit/route.ts", "app/api/admin/summary/route.ts"]) {
    assert.match(readFileSync(route, "utf8"), /requireAdmin\(\)/, `${route} authenticates on its own`);
  }
});

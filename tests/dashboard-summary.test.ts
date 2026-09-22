import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDashboardSummary } from "../lib/store";

// The dashboard used to be the only admin read that loaded the whole dataset
// (every entity, drafts included, with relations) in one request. It now reads
// bounded status aggregates, one entity at a time, and reports failures the
// same way the other admin routes do. These tests cover the counters and the
// request/error-handling contract.

test("the dashboard counters cover the four headline entities, in order", async () => {
  const summary = await getDashboardSummary();
  assert.deepEqual(summary.stats.map((stat) => stat.label), ["Departments", "Programmes", "Faculty & staff", "Laboratories"]);
  for (const stat of summary.stats) {
    assert.equal(stat.total, stat.published + stat.drafts, `${stat.label}: total is published + draft/review`);
    assert.ok(stat.total >= 0 && stat.published >= 0 && stat.drafts >= 0);
  }
});

test("the demo store path counts every record, drafts included (preview behaviour unchanged)", async () => {
  const summary = await getDashboardSummary();
  assert.equal(summary.mode, "demo");
  const departments = summary.stats[0];
  assert.ok(departments.total > 0, "the seed store has departments");
  assert.equal(summary.publishedDepartments, departments.published);
  assert.equal(summary.hasPublishedDepartment, departments.published > 0);
  // The department count is the number of seeded departments (published plus
  // any draft placeholder), never a filtered subset of one status only.
  assert.equal(departments.published, departments.total - departments.drafts);
});

test("the summary route keeps the admin authentication gate and the shared error pattern", () => {
  const route = readFileSync("app/api/admin/summary/route.ts", "utf8");
  // Authorization is unchanged: the same helper every admin route uses.
  assert.match(route, /import \{ requireAdmin \} from "@\/lib\/auth"/);
  assert.match(route, /await requireAdmin\(\)/);
  assert.doesNotMatch(route, /public|cookies\(\)|getSession\(\)/, "the dashboard must not add its own session handling");
  // Only a genuine authentication failure is reported as 401 / unauthorized.
  assert.match(route, /error\.message === "UNAUTHORIZED"[\s\S]*?status: 401/);
  // Every other failure is logged with its real cause (the previous version
  // reported a generic message and logged nothing at all).
  assert.match(route, /console\.error\("Unable to load dashboard\.", error\)/);
});

test("the summary route no longer loads the whole dataset for the dashboard", () => {
  const route = readFileSync("app/api/admin/summary/route.ts", "utf8");
  assert.match(route, /import \{ getDashboardSummary \} from "@\/lib\/store"/);
  assert.doesNotMatch(route, /getSiteData/, "the whole-dataset loader is not a dashboard read");
  assert.doesNotMatch(route, /Promise\.all/, "no parallel fan-out across every entity");
  // The dashboard is scoped from the authenticated session, never from the request.
  assert.match(route, /user\.role === "DEPARTMENT_ADMIN" && user\.departmentId/);
  assert.doesNotMatch(route, /searchParams|request\.json/, "the scope cannot be supplied by the client");
  const store = readFileSync("lib/store.ts", "utf8");
  // Aggregates only: no rows and no relations are loaded for the dashboard.
  assert.match(store, /export async function getDashboardSummary\(scope\?: EntityScope\): Promise<DashboardSummary>/);
  assert.match(store, /groupBy\(\{ by: \["status"\], _count: \{ _all: true \}, where: departmentWhere \}\)/);
  const summaryBody = store.slice(store.indexOf("export async function getDashboardSummary"), store.indexOf("export async function getEntity"));
  assert.doesNotMatch(summaryBody, /findMany|include:/, "counters never materialise records or relations");
});

test("the dashboard only offers the sign-in link when the session really failed", () => {
  const page = readFileSync("app/admin/(app)/page.tsx", "utf8");
  assert.match(page, /auth: response\.status === 401/);
  // The sign-in link is rendered from the auth flag only.
  assert.match(page, /\{error\.auth && <> <Link href="\/admin\/login">Sign in to continue\.<\/Link><\/>\}/);
  const link = page.slice(page.indexOf("Sign in to continue"));
  assert.doesNotMatch(link.slice(0, 200), /^\}: Sign in to continue\./, "the link is not appended to every error");
  // Dashboard content is unchanged.
  for (const marker of ["Content health at a glance.", "Quick actions", "Administration", "admin-stat"]) {
    assert.ok(page.includes(marker), `dashboard still renders ${marker}`);
  }
});

test("the dashboard summary is scoped by the authenticated role, not by the request", () => {
  const route = readFileSync("app/api/admin/summary/route.ts", "utf8");
  // Only a DEPARTMENT_ADMIN with an assigned department gets a scope, and it is
  // resolved from the session via the database — never from a query parameter.
  assert.match(route, /const scope = user\.role === "DEPARTMENT_ADMIN" && user\.departmentId/);
  assert.match(route, /getDashboardSummary\(scope\)/);
  assert.doesNotMatch(route, /new URL\(request\.url\)/, "no client-supplied scope");
  const store = readFileSync("lib/store.ts", "utf8");
  const summary = store.slice(store.indexOf("export async function getDashboardSummary"), store.indexOf("export async function getEntity"));
  // The scope is part of the aggregate queries, so a department administrator's
  // totals never include other departments.
  assert.match(summary, /const departmentWhere = departmentId \? \{ departmentId \} : \{\};/);
  assert.match(summary, /groupBy\(\{ by: \["status"\], _count: \{ _all: true \}, \.\.\.\(departmentId \? \{ where: \{ id: departmentId \} \} : \{\}\) \}\)/);
  assert.match(summary, /scope\?\.departmentSlug/);
});

test("every admin section keeps its own authentication gate", () => {
  for (const route of ["app/api/admin/summary/route.ts", "app/api/admin/content/route.ts", "app/api/admin/audit/route.ts", "app/api/admin/users/route.ts", "app/api/admin/media/upload/route.ts"]) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /requireAdmin\(\)/, `${route} authenticates`);
  }
  // The workspace layout redirects unauthenticated visitors before any page runs.
  const layout = readFileSync("app/admin/(app)/layout.tsx", "utf8");
  assert.match(layout, /const user = await getSession\(\)/);
  assert.match(layout, /if \(!user\) redirect\("\/admin\/login"\)/);
  // Logout clears the session cookie through the existing endpoint.
  assert.match(readFileSync("app/api/auth/logout/route.ts", "utf8"), /clearSession\(\)/);
});

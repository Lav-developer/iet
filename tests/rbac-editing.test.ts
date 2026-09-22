import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccess, canPublish, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

/**
 * Regression tests for the authorization bug that produced
 * "Your role cannot update this record, use that workflow transition, or its
 * relationships are outside the assigned department." for legitimate edits.
 *
 * Root cause: `canAccess` treated every write to a PUBLISHED record as a
 * publishing action for EDITOR and DEPARTMENT_ADMIN (and the workflow refused
 * DRAFT → PUBLISHED for everyone), so the roles that are supposed to maintain
 * content could not correct anything that was already live. Editing authority
 * and publishing authority are now separate decisions.
 */

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-cse" };

const OWN = "computer-science-engineering";
const OTHER = "civil-engineering";
const record = (status: string, departmentSlug = OWN) => ({ id: "rec-1", status, departmentSlug, title: "Existing" });

/** What the editor sends when an existing record is saved without changing its state. */
const savePublished = (extra: Record<string, unknown> = {}) => ({ status: "PUBLISHED", title: "Corrected title", ...extra });

/** The full server decision for a PATCH: access + workflow, as the route applies them. */
function updateAllowed(user: PolicyUser, entity: "programs" | "faculty" | "notices" | "pages", payload: Record<string, unknown>, current: Record<string, unknown>, assigned?: string) {
  return canAccess(user, entity, "write", payload, current, assigned) && workflowTransitionAllowed(user, current, payload.status);
}

test("IET_ADMIN edits a published record (institution-wide) and it stays published", () => {
  assert.equal(updateAllowed(IET, "programs", savePublished(), record("PUBLISHED")), true);
  assert.equal(updateAllowed(IET, "faculty", savePublished({ departmentSlug: OTHER }), record("PUBLISHED", OTHER)), true, "any department");
  assert.equal(updateAllowed(IET, "pages", savePublished(), record("PUBLISHED")), true, "non-department content too");
  // Publishing authority: publish a draft directly, unpublish, archive.
  assert.equal(updateAllowed(IET, "programs", { status: "PUBLISHED" }, record("DRAFT")), true, "publish a draft directly");
  assert.equal(updateAllowed(IET, "programs", { status: "DRAFT" }, record("PUBLISHED")), true, "unpublish");
  assert.equal(updateAllowed(IET, "programs", { status: "ARCHIVED" }, record("PUBLISHED")), true, "archive");
  assert.equal(canPublish(IET), true);
  assert.equal(canPublish(SUPER), true);
});

test("DEPARTMENT_ADMIN edits a published record of the own department and it stays published", () => {
  assert.equal(updateAllowed(DEPT, "programs", savePublished({ departmentSlug: OWN }), record("PUBLISHED"), OWN), true, "explicit own department");
  assert.equal(updateAllowed(DEPT, "programs", savePublished(), record("PUBLISHED"), OWN), true, "department omitted (unchanged)");
  assert.equal(updateAllowed(DEPT, "notices", savePublished({ departmentSlug: OWN }), record("PUBLISHED"), OWN), true, "own department notice");
  // Drafts and records in review stay editable as before.
  assert.equal(updateAllowed(DEPT, "programs", { status: "DRAFT", title: "x" }, record("DRAFT"), OWN), true);
  assert.equal(updateAllowed(DEPT, "programs", { status: "REVIEW" }, record("DRAFT"), OWN), true, "submit for review");
  assert.equal(updateAllowed(DEPT, "programs", { status: "DRAFT" }, record("REVIEW"), OWN), true, "withdraw from review");
  // No publishing authority: cannot publish, unpublish or archive.
  assert.equal(updateAllowed(DEPT, "programs", { status: "PUBLISHED" }, record("DRAFT"), OWN), false, "publish");
  assert.equal(updateAllowed(DEPT, "programs", { status: "DRAFT" }, record("PUBLISHED"), OWN), false, "unpublish");
  assert.equal(updateAllowed(DEPT, "programs", { status: "ARCHIVED" }, record("PUBLISHED"), OWN), false, "archive");
  assert.equal(canPublish(DEPT), false);
});

test("EDITOR edits an authorized record — draft, in review or published — without SUPER_ADMIN approval", () => {
  assert.equal(updateAllowed(EDITOR, "programs", { status: "DRAFT", title: "x" }, record("DRAFT")), true);
  assert.equal(updateAllowed(EDITOR, "programs", { status: "REVIEW", title: "x" }, record("REVIEW")), true);
  assert.equal(updateAllowed(EDITOR, "programs", savePublished(), record("PUBLISHED")), true, "published record");
  assert.equal(updateAllowed(EDITOR, "notices", savePublished(), record("PUBLISHED", "")), true, "institution-wide notice");
  assert.equal(updateAllowed(EDITOR, "pages", savePublished(), record("PUBLISHED")), true);
  // Status omitted entirely (API clients): still an edit, still allowed.
  assert.equal(updateAllowed(EDITOR, "programs", { title: "Only the title" }, record("PUBLISHED")), true);
  // Still no publishing authority and no delete.
  assert.equal(updateAllowed(EDITOR, "programs", { status: "PUBLISHED" }, record("DRAFT")), false);
  assert.equal(updateAllowed(EDITOR, "programs", { status: "DRAFT" }, record("PUBLISHED")), false);
  assert.equal(updateAllowed(EDITOR, "programs", { status: "ARCHIVED" }, record("PUBLISHED")), false);
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, record("PUBLISHED")), false);
  assert.equal(canPublish(EDITOR), false);
});

test("DEPARTMENT_ADMIN is blocked on another department's record, published or not", () => {
  for (const status of ["DRAFT", "REVIEW", "PUBLISHED"]) {
    assert.equal(updateAllowed(DEPT, "programs", { title: "x" }, record(status, OTHER), OWN), false, `edit ${status} record of another department`);
    assert.equal(updateAllowed(DEPT, "programs", { title: "x", departmentSlug: OWN }, record(status, OTHER), OWN), false, `claim ${status} record of another department`);
    assert.equal(updateAllowed(DEPT, "notices", { title: "x" }, record(status, OTHER), OWN), false, `edit ${status} notice of another department`);
  }
  assert.equal(canAccess(DEPT, "programs", "read", undefined, record("PUBLISHED", OTHER), OWN), false, "not even readable");
  // Without a resolvable assigned department nothing is writable.
  assert.equal(updateAllowed(DEPT, "programs", savePublished(), record("PUBLISHED"), undefined), false);
  assert.equal(updateAllowed({ role: "DEPARTMENT_ADMIN" }, "programs", savePublished(), record("PUBLISHED"), OWN), false);
});

test("unauthorized relationship assignment is blocked: department reassignment and cross-department links", () => {
  // Moving an own-department record to another department is refused…
  assert.equal(updateAllowed(DEPT, "programs", savePublished({ departmentSlug: OTHER }), record("PUBLISHED"), OWN), false);
  assert.equal(updateAllowed(DEPT, "faculty", { status: "DRAFT", departmentSlug: OTHER }, record("DRAFT"), OWN), false);
  // …and so is creating outside the assigned department.
  assert.equal(canAccess(DEPT, "programs", "write", { departmentSlug: OTHER, status: "DRAFT" }, undefined, OWN), false);
  assert.equal(canAccess(DEPT, "programs", "write", { status: "DRAFT" }, undefined, OWN), false, "a new record must name the own department");
  // Linked laboratories / faculty of another department are refused by the
  // route's relationship check, which stays in place for every write.
  const route = readFileSync("app/api/admin/content/route.ts", "utf8");
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  for (const [name, handler] of [["POST", post], ["PATCH", patch]] as const) {
    assert.match(handler, /if \(!\(await departmentRelationsAllowed\(user, entity, data\)\)\) return forbidden\(RELATIONS_OUTSIDE_DEPARTMENT\)/, `${name} keeps the relationship check`);
    assert.match(handler, /workflowTransitionAllowed\(user, (undefined|current), data\.status\)/, `${name} keeps the workflow check`);
  }
  assert.match(patch, /if \(!canAccess\(user, entity, "write", data, current, assignedDepartmentSlug\)\)/);
  const relations = route.slice(route.indexOf("async function departmentRelationsAllowed"));
  assert.match(relations, /prisma\.laboratory\.findMany\(\{ where: \{ departmentId: user\.departmentId, OR: \[\{ slug: \{ in: ids \} \}, \{ id: \{ in: ids \} \}\] \}/);
  assert.match(relations, /prisma\.facultyMember\.findMany\(\{ where: \{ departmentId: user\.departmentId/);
  assert.match(relations, /return rows\.length === ids\.length;/);
});

test("the API explains each refusal separately instead of one combined message", () => {
  const route = readFileSync("app/api/admin/content/route.ts", "utf8");
  assert.doesNotMatch(route, /cannot update this record, use that workflow transition, or its relationships are outside/);
  assert.match(route, /function accessDeniedMessage\(/);
  assert.match(route, /function workflowDeniedMessage\(/);
  assert.match(route, /const RELATIONS_OUTSIDE_DEPARTMENT = "One or more linked records/);
  // Refusals stay 403s, the audit trail and department scoping are untouched.
  assert.match(route, /function forbidden\(message: string\) \{\s*return NextResponse\.json\(\{ error: message \}, \{ status: 403 \}\);/);
  assert.match(route, /getAssignedDepartmentSlug\(user\.departmentId\)/);
  assert.match(route, /requireAdmin\(\)/);
});

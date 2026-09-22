import test from "node:test";
import assert from "node:assert/strict";
import { canPublish, canUnpublish, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser, PublishScope } from "../lib/content-policy";

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" };

const OWN = "computer-science-engineering";
const OTHER = "civil-engineering";
const cur = (status: string, departmentSlug = OWN) => ({ status, departmentSlug });
/** A department-scoped record of the department administrator's own department. */
const own: PublishScope = { entity: "programs", departmentSlug: OWN, assignedDepartmentSlug: OWN };
/** The same entity, another department's record. */
const other: PublishScope = { entity: "programs", departmentSlug: OTHER, assignedDepartmentSlug: OWN };
/** Institution-wide content (not department-scoped). */
const wide: PublishScope = { entity: "pages" };

// Publishing authority is decided per record. SUPER_ADMIN and IET_ADMIN publish
// everything; a DEPARTMENT_ADMIN publishes, unpublishes and archives inside the
// assigned department only; an EDITOR publishes within its editorial scope but
// does not unpublish or archive. Editing authority is separate (see
// rbac-editing.test.ts) and never depends on a SUPER_ADMIN approval step.
test("publishing authority: institute roles everywhere, department administrators in their department, editors in their scope", () => {
  for (const scope of [own, other, wide, undefined]) {
    assert.equal(canPublish(SUPER, scope), true);
    assert.equal(canPublish(IET, scope), true);
    assert.equal(canUnpublish(SUPER, scope), true);
    assert.equal(canUnpublish(IET, scope), true);
  }
  assert.equal(canPublish(DEPT, own), true, "own department");
  assert.equal(canUnpublish(DEPT, own), true, "own department: unpublish/archive too");
  assert.equal(canPublish(DEPT, other), false, "never another department");
  assert.equal(canUnpublish(DEPT, other), false);
  assert.equal(canPublish(DEPT, wide), false, "never an entity that is not department-scoped");
  assert.equal(canPublish(DEPT, { entity: "programs", departmentSlug: OWN }), false, "no resolvable assigned department → nothing");
  assert.equal(canPublish({ role: "DEPARTMENT_ADMIN" }, own), false, "no department on the account → nothing");
  assert.equal(canPublish(EDITOR, own), true, "editorial scope covers department content");
  assert.equal(canPublish(EDITOR, wide), true, "and institution-wide content");
  assert.equal(canUnpublish(EDITOR, own), false, "editors do not unpublish or archive");
  assert.equal(canUnpublish(EDITOR, wide), false);
  // Without a record scope no delegated authority is assumed.
  assert.equal(canPublish(EDITOR), false);
  assert.equal(canPublish(DEPT), false);
  assert.equal(canUnpublish(DEPT), false);
});

test("creation: DRAFT or REVIEW for every writer, PUBLISHED with publishing authority, never ARCHIVED", () => {
  for (const user of [SUPER, IET, EDITOR, DEPT]) {
    assert.equal(workflowTransitionAllowed(user, undefined, "DRAFT", own), true, `${user.role} create DRAFT`);
    assert.equal(workflowTransitionAllowed(user, undefined, undefined, own), true, `${user.role} create without status`);
    assert.equal(workflowTransitionAllowed(user, undefined, "REVIEW", own), true, `${user.role} create REVIEW`);
    assert.equal(workflowTransitionAllowed(user, undefined, "ARCHIVED", own), false, `${user.role} create ARCHIVED`);
    assert.equal(workflowTransitionAllowed(user, undefined, "BOGUS", own), false, `${user.role} create invalid status`);
    assert.equal(workflowTransitionAllowed(user, undefined, "PUBLISHED", own), true, `${user.role} publishes a new own-department record directly`);
  }
  assert.equal(workflowTransitionAllowed(EDITOR, undefined, "PUBLISHED", wide), true);
  assert.equal(workflowTransitionAllowed(DEPT, undefined, "PUBLISHED", other), false, "not in another department");
  assert.equal(workflowTransitionAllowed(DEPT, undefined, "PUBLISHED", wide), false, "not outside department-scoped entities");
  assert.equal(workflowTransitionAllowed(EDITOR, undefined, "PUBLISHED"), false, "no scope, no delegated authority");
});

test("DRAFT → REVIEW is allowed for any writer (review is optional, never compulsory)", () => {
  for (const user of [SUPER, IET, EDITOR, DEPT]) assert.equal(workflowTransitionAllowed(user, cur("DRAFT"), "REVIEW", own), true, user.role);
});

test("DRAFT → PUBLISHED and REVIEW → PUBLISHED directly, with publishing authority for the record (no mandatory REVIEW / SUPER_ADMIN approval)", () => {
  for (const from of ["DRAFT", "REVIEW"]) {
    for (const user of [SUPER, IET, EDITOR, DEPT]) assert.equal(workflowTransitionAllowed(user, cur(from), "PUBLISHED", own), true, `${user.role} ${from} → PUBLISHED`);
    assert.equal(workflowTransitionAllowed(DEPT, cur(from, OTHER), "PUBLISHED", other), false, `department administrator ${from} → PUBLISHED, other department`);
    assert.equal(workflowTransitionAllowed(EDITOR, cur(from), "PUBLISHED", wide), true, `editor ${from} → PUBLISHED, institution-wide`);
    assert.equal(workflowTransitionAllowed(EDITOR, cur(from), "PUBLISHED"), false, `editor ${from} → PUBLISHED without scope`);
  }
});

test("PUBLISHED → ARCHIVED and PUBLISHED → DRAFT (unpublish): institute roles and the own-department administrator; never editors", () => {
  for (const user of [SUPER, IET, DEPT]) {
    assert.equal(workflowTransitionAllowed(user, cur("PUBLISHED"), "ARCHIVED", own), true, `${user.role} archives`);
    assert.equal(workflowTransitionAllowed(user, cur("PUBLISHED"), "DRAFT", own), true, `${user.role} unpublishes`);
  }
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED", OTHER), "ARCHIVED", other), false, "not another department's record");
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED", OTHER), "DRAFT", other), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "ARCHIVED", own), false, "editors cannot archive");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "DRAFT", own), false, "editors cannot unpublish");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "DRAFT", wide), false);
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "REVIEW"), false, "a live record is unpublished to draft, not to review");
});

test("ARCHIVED → DRAFT (restore) needs unpublish authority; archived records never go straight back live", () => {
  for (const user of [SUPER, IET, DEPT]) assert.equal(workflowTransitionAllowed(user, cur("ARCHIVED"), "DRAFT", own), true, user.role);
  assert.equal(workflowTransitionAllowed(DEPT, cur("ARCHIVED", OTHER), "DRAFT", other), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("ARCHIVED"), "DRAFT", own), false);
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "REVIEW"), false);
});

test("REVIEW → DRAFT is allowed (review can be withdrawn by any writer)", () => {
  for (const user of [SUPER, IET, EDITOR, DEPT]) assert.equal(workflowTransitionAllowed(user, cur("REVIEW"), "DRAFT", own), true, user.role);
});

test("same-status saves: a live record stays live only with publishing authority; drafts always; invalid status strings are rejected", () => {
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "DRAFT", own), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("REVIEW"), "REVIEW", own), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "PUBLISHED", own), true, "saving an edit to a live record keeps it live");
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED"), "PUBLISHED", own), true);
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED", OTHER), "PUBLISHED", other), false, "not another department's live record");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "PUBLISHED"), false, "without scope a live record cannot be saved as live");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("ARCHIVED"), "ARCHIVED", own), false, "archived records are read-only without archive authority");
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "ARCHIVED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "published", own), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "", own), false);
});

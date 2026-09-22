import test from "node:test";
import assert from "node:assert/strict";
import { canPublish, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" };

const cur = (status: string) => ({ status });

// Publishing authority: SUPER_ADMIN and IET_ADMIN publish directly. Editing
// authority is separate (see rbac-editing.test.ts) and never depends on a
// SUPER_ADMIN approval step.
test("publishing authority is held by SUPER_ADMIN and IET_ADMIN only", () => {
  assert.equal(canPublish(SUPER), true);
  assert.equal(canPublish(IET), true);
  assert.equal(canPublish(EDITOR), false);
  assert.equal(canPublish(DEPT), false);
});

test("creation: DRAFT or REVIEW for every writer, PUBLISHED for publishing roles, never ARCHIVED", () => {
  for (const user of [SUPER, IET, EDITOR, DEPT]) {
    assert.equal(workflowTransitionAllowed(user, undefined, "DRAFT"), true, `${user.role} create DRAFT`);
    assert.equal(workflowTransitionAllowed(user, undefined, undefined), true, `${user.role} create without status`);
    assert.equal(workflowTransitionAllowed(user, undefined, "REVIEW"), true, `${user.role} create REVIEW`);
    assert.equal(workflowTransitionAllowed(user, undefined, "ARCHIVED"), false, `${user.role} create ARCHIVED`);
    assert.equal(workflowTransitionAllowed(user, undefined, "BOGUS"), false, `${user.role} create invalid status`);
  }
  assert.equal(workflowTransitionAllowed(IET, undefined, "PUBLISHED"), true, "IET_ADMIN publishes a new record directly");
  assert.equal(workflowTransitionAllowed(SUPER, undefined, "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, undefined, "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, undefined, "PUBLISHED"), false);
});

test("DRAFT → REVIEW is allowed for any writer (review is optional, never compulsory)", () => {
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(DEPT, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(IET, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("DRAFT"), "REVIEW"), true);
});

test("DRAFT → PUBLISHED is allowed directly for publishing roles (no mandatory REVIEW / SUPER_ADMIN approval)", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("DRAFT"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("DRAFT"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("DRAFT"), "PUBLISHED"), false);
});

test("REVIEW → PUBLISHED only for SUPER_ADMIN / IET_ADMIN", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("REVIEW"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("REVIEW"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("REVIEW"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("REVIEW"), "PUBLISHED"), false);
});

test("PUBLISHED → ARCHIVED and PUBLISHED → DRAFT (unpublish) only for SUPER_ADMIN / IET_ADMIN", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "ARCHIVED"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("PUBLISHED"), "ARCHIVED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "ARCHIVED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED"), "ARCHIVED"), false);
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "DRAFT"), true, "publishers may unpublish");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "DRAFT"), false, "editors cannot unpublish");
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED"), "DRAFT"), false, "department administrators cannot unpublish");
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "REVIEW"), false, "a live record is unpublished to draft, not to review");
});

test("ARCHIVED → DRAFT only for SUPER_ADMIN / IET_ADMIN; archived records never go straight back live", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("ARCHIVED"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("ARCHIVED"), "DRAFT"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("ARCHIVED"), "DRAFT"), false);
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "REVIEW"), false);
});

test("REVIEW → DRAFT is allowed (review can be withdrawn by any writer)", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("REVIEW"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("REVIEW"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(DEPT, cur("REVIEW"), "DRAFT"), true);
});

test("same-status transitions are allowed; invalid status strings are rejected", () => {
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "PUBLISHED"), true, "saving an edit to a live record keeps it live");
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "published"), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), ""), false);
});

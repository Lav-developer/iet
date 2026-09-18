import test from "node:test";
import assert from "node:assert/strict";
import { workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" };

const cur = (status: string) => ({ status });

test("creation must be DRAFT (or omit status) for every role", () => {
  for (const user of [SUPER, IET, EDITOR, DEPT]) {
    assert.equal(workflowTransitionAllowed(user, undefined, "DRAFT"), true, `${user.role} create DRAFT`);
    assert.equal(workflowTransitionAllowed(user, undefined, undefined), true, `${user.role} create without status`);
    assert.equal(workflowTransitionAllowed(user, undefined, "REVIEW"), false, `${user.role} create REVIEW`);
    assert.equal(workflowTransitionAllowed(user, undefined, "PUBLISHED"), false, `${user.role} create PUBLISHED`);
    assert.equal(workflowTransitionAllowed(user, undefined, "ARCHIVED"), false, `${user.role} create ARCHIVED`);
    assert.equal(workflowTransitionAllowed(user, undefined, "BOGUS"), false, `${user.role} create invalid status`);
  }
});

test("DRAFT → REVIEW is allowed for any writer", () => {
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(DEPT, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(IET, cur("DRAFT"), "REVIEW"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("DRAFT"), "REVIEW"), true);
});

test("DRAFT → PUBLISHED is not allowed (must go through REVIEW), for any role", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("DRAFT"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(SUPER, cur("DRAFT"), "PUBLISHED"), false);
});

test("REVIEW → PUBLISHED only for SUPER_ADMIN / IET_ADMIN", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("REVIEW"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("REVIEW"), "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("REVIEW"), "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("REVIEW"), "PUBLISHED"), false);
});

test("PUBLISHED → ARCHIVED only for SUPER_ADMIN / IET_ADMIN; no direct unpublish", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "ARCHIVED"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("PUBLISHED"), "ARCHIVED"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("PUBLISHED"), "ARCHIVED"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("PUBLISHED"), "ARCHIVED"), false);
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "DRAFT"), false, "no direct unpublish");
  assert.equal(workflowTransitionAllowed(IET, cur("PUBLISHED"), "REVIEW"), false, "no direct unpublish to review");
});

test("ARCHIVED → DRAFT only for SUPER_ADMIN / IET_ADMIN", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("ARCHIVED"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(SUPER, cur("ARCHIVED"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("ARCHIVED"), "DRAFT"), false);
  assert.equal(workflowTransitionAllowed(DEPT, cur("ARCHIVED"), "DRAFT"), false);
});

test("REVIEW → DRAFT is not allowed (no backing out of review)", () => {
  assert.equal(workflowTransitionAllowed(IET, cur("REVIEW"), "DRAFT"), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("REVIEW"), "DRAFT"), false);
});

test("same-status transitions are allowed; invalid status strings are rejected", () => {
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "DRAFT"), true);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), "published"), false);
  assert.equal(workflowTransitionAllowed(EDITOR, cur("DRAFT"), ""), false);
});

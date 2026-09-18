import test from "node:test";
import assert from "node:assert/strict";
import { canAccess, departmentScoped } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT_OWN: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" };
const DEPT_NONE: PolicyUser = { role: "DEPARTMENT_ADMIN" };

const OWN = "computer-science-engineering";
const OTHER = "civil-engineering";
const ownCurrent = (status = "DRAFT") => ({ id: "p1", status, departmentSlug: OWN });
const otherCurrent = (status = "DRAFT") => ({ id: "p2", status, departmentSlug: OTHER });

test("SUPER_ADMIN and IET_ADMIN: unrestricted read/write/delete on every entity", () => {
  for (const user of [SUPER, IET]) {
    for (const entity of ["departments", "programs", "faculty", "media", "documents", "settings"] as const) {
      assert.equal(canAccess(user, entity, "read"), true, `${user.role} read ${entity}`);
      assert.equal(canAccess(user, entity, "write"), true, `${user.role} write ${entity}`);
      assert.equal(canAccess(user, entity, "write", { status: "PUBLISHED" }), true, `${user.role} publish ${entity}`);
      assert.equal(canAccess(user, entity, "delete", undefined, ownCurrent("PUBLISHED")), true, `${user.role} delete ${entity}`);
    }
  }
});

test("EDITOR: reads everything, edits only unpublished records, never deletes, never publishes", () => {
  assert.equal(canAccess(EDITOR, "programs", "read"), true);
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("DRAFT")), true);
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("REVIEW")), true);
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "REVIEW" }, ownCurrent("DRAFT")), true);
  // Cannot touch published or archived records.
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("PUBLISHED")), false);
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("ARCHIVED")), false);
  // Cannot set a record to PUBLISHED/ARCHIVED, even a draft.
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }, ownCurrent("DRAFT")), false);
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "ARCHIVED" }, ownCurrent("DRAFT")), false);
  // Cannot delete anything.
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, ownCurrent("DRAFT")), false);
  // Creates are allowed (must be DRAFT — enforced by the workflow test).
  assert.equal(canAccess(EDITOR, "programs", "write", { departmentSlug: OTHER }), true);
});

test("DEPARTMENT_ADMIN without a department: denied everything", () => {
  assert.equal(canAccess(DEPT_NONE, "programs", "read", undefined, undefined, undefined), false);
  assert.equal(canAccess(DEPT_NONE, "programs", "write", undefined, undefined, undefined), false);
  // Non-scoped entities are denied even with a department.
  for (const entity of ["departments", "researchAreas", "pages", "links", "contacts", "settings", "media"] as const) {
    assert.equal(departmentScoped.has(entity), false, `${entity} must be non-scoped`);
    assert.equal(canAccess(DEPT_OWN, entity, "read", undefined, undefined, OWN), false, `read ${entity}`);
    assert.equal(canAccess(DEPT_OWN, entity, "write", undefined, undefined, OWN), false, `write ${entity}`);
  }
});

test("DEPARTMENT_ADMIN: scoped read/write on own department only, drafts only, no delete", () => {
  // Own department, draft record.
  assert.equal(canAccess(DEPT_OWN, "programs", "read", undefined, ownCurrent("DRAFT"), OWN), true);
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, ownCurrent("DRAFT"), OWN), true);
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "REVIEW" }, ownCurrent("DRAFT"), OWN), true);
  // Creating in the own department is allowed.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { departmentSlug: OWN }, undefined, OWN), true);
  // Other department: denied on read of its records and on any write.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, otherCurrent("DRAFT"), OWN), false, "edit another department's record");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { departmentSlug: OTHER }, undefined, OWN), false, "create in another department");
  // Moving an own-department record to another department: denied.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { departmentSlug: OTHER }, ownCurrent("DRAFT"), OWN), false, "reassign to another department");
  // A record with no department may be adopted into the assigned department.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { departmentSlug: OWN }, { id: "p3", status: "DRAFT" }, OWN), true, "adopt departmentless record");
  // Published records are read-only for department admins.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, ownCurrent("PUBLISHED"), OWN), false, "edit published");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, ownCurrent("REVIEW"), OWN), false, "publish");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "ARCHIVED" }, ownCurrent("PUBLISHED"), OWN), false, "archive");
  // Deletion is never allowed.
  assert.equal(canAccess(DEPT_OWN, "programs", "delete", undefined, ownCurrent("DRAFT"), OWN), false, "delete");
});

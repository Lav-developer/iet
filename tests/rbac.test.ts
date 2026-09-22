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

test("EDITOR: reads everything, edits drafts, reviews and published records, never deletes, never changes publication state", () => {
  assert.equal(canAccess(EDITOR, "programs", "read"), true);
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("DRAFT")), true);
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("REVIEW")), true);
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "REVIEW" }, ownCurrent("DRAFT")), true);
  // Editing authority is separate from publishing authority: a published
  // record stays editable (the change goes live), and saving it keeps it
  // published.
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("PUBLISHED")), true, "edit a published record");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED", title: "Updated" }, ownCurrent("PUBLISHED")), true, "save a published record as published");
  // Archived records are read-only until an institute administrator restores them.
  assert.equal(canAccess(EDITOR, "programs", "write", undefined, ownCurrent("ARCHIVED")), false);
  // Cannot change the publication state: no publishing, unpublishing or archiving.
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }, ownCurrent("DRAFT")), false, "publish a draft");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }, ownCurrent("REVIEW")), false, "publish from review");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "ARCHIVED" }, ownCurrent("DRAFT")), false, "archive");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "DRAFT" }, ownCurrent("PUBLISHED")), false, "unpublish");
  // Cannot delete anything.
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, ownCurrent("DRAFT")), false);
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, ownCurrent("PUBLISHED")), false);
  // Creates are allowed (as DRAFT or REVIEW — enforced by the workflow test).
  assert.equal(canAccess(EDITOR, "programs", "write", { departmentSlug: OTHER }), true);
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }), false, "cannot create a record as published");
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

test("DEPARTMENT_ADMIN: scoped read/write on own department only (published records included), no publishing, no delete", () => {
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
  // Published records of the own department stay editable; the publication
  // state itself cannot be changed by a department administrator.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, ownCurrent("PUBLISHED"), OWN), true, "edit published (own department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED", departmentSlug: OWN, title: "Updated" }, ownCurrent("PUBLISHED"), OWN), true, "save published (own department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, otherCurrent("PUBLISHED"), OWN), false, "edit published (other department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, ownCurrent("REVIEW"), OWN), false, "publish");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, ownCurrent("DRAFT"), OWN), false, "publish a draft");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "DRAFT" }, ownCurrent("PUBLISHED"), OWN), false, "unpublish");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "ARCHIVED" }, ownCurrent("PUBLISHED"), OWN), false, "archive");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, ownCurrent("ARCHIVED"), OWN), false, "archived records are read-only");
  // Deletion is never allowed.
  assert.equal(canAccess(DEPT_OWN, "programs", "delete", undefined, ownCurrent("DRAFT"), OWN), false, "delete");
});

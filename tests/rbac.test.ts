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
  // Publishes within the editorial scope (directly, review optional)…
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }, ownCurrent("DRAFT")), true, "publish a draft");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }, ownCurrent("REVIEW")), true, "publish from review");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "PUBLISHED" }), true, "create a record as published");
  // …but does not unpublish, archive or restore.
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "ARCHIVED" }, ownCurrent("DRAFT")), false, "archive");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "ARCHIVED" }, ownCurrent("PUBLISHED")), false, "archive a live record");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "DRAFT" }, ownCurrent("PUBLISHED")), false, "unpublish");
  assert.equal(canAccess(EDITOR, "programs", "write", { status: "DRAFT" }, ownCurrent("ARCHIVED")), false, "restore");
  // Cannot delete anything.
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, ownCurrent("DRAFT")), false);
  assert.equal(canAccess(EDITOR, "programs", "delete", undefined, ownCurrent("PUBLISHED")), false);
  // Creates are allowed in any department (institution-wide scope).
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
  // Published records of the own department stay editable, and the department
  // administrator holds full publishing authority there: publish, unpublish,
  // archive and restore — inside the assigned department only.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, ownCurrent("PUBLISHED"), OWN), true, "edit published (own department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED", departmentSlug: OWN, title: "Updated" }, ownCurrent("PUBLISHED"), OWN), true, "save published (own department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", undefined, otherCurrent("PUBLISHED"), OWN), false, "edit published (other department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, ownCurrent("REVIEW"), OWN), true, "publish");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, ownCurrent("DRAFT"), OWN), true, "publish a draft");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED", departmentSlug: OWN }, undefined, OWN), true, "create as published");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "DRAFT" }, ownCurrent("PUBLISHED"), OWN), true, "unpublish");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "ARCHIVED" }, ownCurrent("PUBLISHED"), OWN), true, "archive");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "DRAFT" }, ownCurrent("ARCHIVED"), OWN), true, "restore");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED" }, otherCurrent("DRAFT"), OWN), false, "publish (other department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED", departmentSlug: OTHER }, undefined, OWN), false, "create as published (other department)");
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "ARCHIVED" }, otherCurrent("PUBLISHED"), OWN), false, "archive (other department)");
  // Without a resolvable assigned department no publishing authority exists.
  assert.equal(canAccess(DEPT_OWN, "programs", "write", { status: "PUBLISHED", departmentSlug: OWN }, ownCurrent("DRAFT"), undefined), false, "publish without a resolvable department");
  // Deletion is never allowed.
  assert.equal(canAccess(DEPT_OWN, "programs", "delete", undefined, ownCurrent("DRAFT"), OWN), false, "delete");
});

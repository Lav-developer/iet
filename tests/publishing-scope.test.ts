import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccess, canPublish, canUnpublish, departmentScoped, entityCapability, entityValues, workflowActions, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser, PublishScope } from "../lib/content-policy";
import type { EntityName } from "../lib/types";

/**
 * Publishing authority, decided per record, exactly as the content API
 * composes it (canAccess + workflowTransitionAllowed with the request's scope):
 *
 * - SUPER_ADMIN / IET_ADMIN: publish, unpublish, archive anywhere;
 * - DEPARTMENT_ADMIN: publish, unpublish, archive only for records of the
 *   assigned department, and only for department-scoped entities;
 * - EDITOR: publishes within the editorial scope; never unpublishes/archives.
 *
 * The admin editor derives its buttons from the same policy, so what a role
 * is offered and what the server accepts can never disagree.
 */

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-cse" };

const OWN = "computer-science-engineering";
const OTHER = "civil-engineering";
const scopedEntities = [...entityValues].filter((entity) => departmentScoped.has(entity));
const wideEntities = [...entityValues].filter((entity) => !departmentScoped.has(entity));

/** The server's full decision for a create or an update, with the scope the route builds. */
function serverAllows(user: PolicyUser, entity: EntityName, payload: Record<string, unknown>, current: Record<string, unknown> | undefined, assigned?: string) {
  const departmentSlug = payload.departmentSlug === undefined ? current?.departmentSlug : payload.departmentSlug;
  const scope: PublishScope = { entity, departmentSlug, assignedDepartmentSlug: assigned };
  return canAccess(user, entity, "write", payload, current, assigned) && workflowTransitionAllowed(user, current, payload.status, scope);
}

test("DEPARTMENT_ADMIN publishes a record of the own department — every department-scoped entity, from new, draft or review", () => {
  for (const entity of scopedEntities) {
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OWN }, undefined, OWN), true, `${entity}: create as published`);
    for (const from of ["DRAFT", "REVIEW"]) {
      assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OWN }, { id: "r", status: from, departmentSlug: OWN }, OWN), true, `${entity}: ${from} → PUBLISHED`);
      assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED" }, { id: "r", status: from, departmentSlug: OWN }, OWN), true, `${entity}: ${from} → PUBLISHED, department omitted (unchanged)`);
    }
    // Full authority over the own department's live records: keep live, unpublish, archive, restore.
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", title: "Corrected" }, { id: "r", status: "PUBLISHED", departmentSlug: OWN }, OWN), true, `${entity}: edit a live record`);
    assert.equal(serverAllows(DEPT, entity, { status: "DRAFT" }, { id: "r", status: "PUBLISHED", departmentSlug: OWN }, OWN), true, `${entity}: unpublish`);
    assert.equal(serverAllows(DEPT, entity, { status: "ARCHIVED" }, { id: "r", status: "PUBLISHED", departmentSlug: OWN }, OWN), true, `${entity}: archive`);
    assert.equal(serverAllows(DEPT, entity, { status: "DRAFT" }, { id: "r", status: "ARCHIVED", departmentSlug: OWN }, OWN), true, `${entity}: restore`);
    assert.equal(canPublish(DEPT, { entity, departmentSlug: OWN, assignedDepartmentSlug: OWN }), true, entity);
    assert.equal(canUnpublish(DEPT, { entity, departmentSlug: OWN, assignedDepartmentSlug: OWN }), true, entity);
  }
});

test("DEPARTMENT_ADMIN cannot publish (or unpublish, archive, restore, edit) another department's record, nor move a record across departments", () => {
  for (const entity of scopedEntities) {
    const other = (status: string) => ({ id: "r", status, departmentSlug: OTHER });
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OTHER }, undefined, OWN), false, `${entity}: create as published in another department`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED" }, other("DRAFT"), OWN), false, `${entity}: publish another department's draft`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED" }, other("REVIEW"), OWN), false, `${entity}: publish another department's record in review`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OWN }, other("DRAFT"), OWN), false, `${entity}: claim and publish another department's record`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OTHER }, { id: "r", status: "DRAFT", departmentSlug: OWN }, OWN), false, `${entity}: move an own record to another department`);
    assert.equal(serverAllows(DEPT, entity, { status: "DRAFT" }, other("PUBLISHED"), OWN), false, `${entity}: unpublish another department's record`);
    assert.equal(serverAllows(DEPT, entity, { status: "ARCHIVED" }, other("PUBLISHED"), OWN), false, `${entity}: archive another department's record`);
    assert.equal(serverAllows(DEPT, entity, { status: "DRAFT" }, other("ARCHIVED"), OWN), false, `${entity}: restore another department's record`);
    assert.equal(serverAllows(DEPT, entity, { title: "x" }, other("PUBLISHED"), OWN), false, `${entity}: edit another department's live record`);
    assert.equal(canPublish(DEPT, { entity, departmentSlug: OTHER, assignedDepartmentSlug: OWN }), false, entity);
    assert.equal(canUnpublish(DEPT, { entity, departmentSlug: OTHER, assignedDepartmentSlug: OWN }), false, entity);
  }
});

test("DEPARTMENT_ADMIN never publishes institution-wide content, and nothing without a resolvable assigned department", () => {
  for (const entity of wideEntities) {
    assert.equal(canPublish(DEPT, { entity, assignedDepartmentSlug: OWN }), false, `${entity} is not department-scoped`);
    assert.equal(canPublish(DEPT, { entity, departmentSlug: OWN, assignedDepartmentSlug: OWN }), false, `${entity}: a department name does not make it department-scoped`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED" }, undefined, OWN), false, `${entity}: create as published`);
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED" }, { id: "r", status: "DRAFT" }, OWN), false, `${entity}: publish`);
    assert.equal(entityCapability(DEPT, entity, OWN).canPublish, false, `${entity}: no Publish button`);
  }
  for (const entity of scopedEntities) {
    assert.equal(serverAllows(DEPT, entity, { status: "PUBLISHED", departmentSlug: OWN }, undefined, undefined), false, `${entity}: unresolved department`);
    assert.equal(serverAllows({ role: "DEPARTMENT_ADMIN" }, entity, { status: "PUBLISHED", departmentSlug: OWN }, undefined, OWN), false, `${entity}: account without department`);
    assert.equal(canPublish(DEPT, { entity, departmentSlug: OWN }), false, `${entity}: unresolved department`);
    assert.equal(entityCapability(DEPT, entity).canPublish, false, `${entity}: no Publish button without a resolved department`);
  }
});

test("EDITOR publishes within the editorial scope (institution-wide: every entity, any department) but never unpublishes, archives or restores", () => {
  for (const entity of entityValues) {
    const departmentSlug = departmentScoped.has(entity) ? OTHER : undefined;
    assert.equal(serverAllows(EDITOR, entity, { status: "PUBLISHED", departmentSlug }, undefined), true, `${entity}: create as published`);
    assert.equal(serverAllows(EDITOR, entity, { status: "PUBLISHED" }, { id: "r", status: "DRAFT", departmentSlug }), true, `${entity}: DRAFT → PUBLISHED`);
    assert.equal(serverAllows(EDITOR, entity, { status: "PUBLISHED" }, { id: "r", status: "REVIEW", departmentSlug }), true, `${entity}: REVIEW → PUBLISHED`);
    assert.equal(serverAllows(EDITOR, entity, { status: "PUBLISHED", title: "Corrected" }, { id: "r", status: "PUBLISHED", departmentSlug }), true, `${entity}: edit a live record (stays live)`);
    assert.equal(serverAllows(EDITOR, entity, { status: "DRAFT" }, { id: "r", status: "PUBLISHED", departmentSlug }), false, `${entity}: unpublish`);
    assert.equal(serverAllows(EDITOR, entity, { status: "ARCHIVED" }, { id: "r", status: "PUBLISHED", departmentSlug }), false, `${entity}: archive`);
    assert.equal(serverAllows(EDITOR, entity, { status: "DRAFT" }, { id: "r", status: "ARCHIVED", departmentSlug }), false, `${entity}: restore`);
    assert.equal(canPublish(EDITOR, { entity, departmentSlug }), true, entity);
    assert.equal(canUnpublish(EDITOR, { entity, departmentSlug }), false, entity);
    assert.equal(entityCapability(EDITOR, entity).canPublish, true, `${entity}: Publish button`);
    assert.equal(entityCapability(EDITOR, entity).canUnpublish, false, `${entity}: no Unpublish button`);
  }
  // Without a record scope no delegated authority is assumed (safe default).
  assert.equal(canPublish(EDITOR), false);
  assert.equal(workflowTransitionAllowed(EDITOR, { id: "r", status: "DRAFT" }, "PUBLISHED"), false);
});

test("unauthorized publishing is rejected; institute roles are unrestricted", () => {
  const cases: [PolicyUser, EntityName, Record<string, unknown>, Record<string, unknown> | undefined, string | undefined][] = [
    [DEPT, "programs", { status: "PUBLISHED", departmentSlug: OTHER }, undefined, OWN],
    [DEPT, "notices", { status: "PUBLISHED" }, { id: "r", status: "REVIEW", departmentSlug: OTHER }, OWN],
    [DEPT, "pages", { status: "PUBLISHED" }, { id: "r", status: "DRAFT" }, OWN],
    [DEPT, "programs", { status: "PUBLISHED", departmentSlug: OWN }, undefined, undefined],
    [EDITOR, "programs", { status: "DRAFT" }, { id: "r", status: "PUBLISHED", departmentSlug: OWN }, undefined],
    [EDITOR, "programs", { status: "ARCHIVED" }, { id: "r", status: "PUBLISHED", departmentSlug: OWN }, undefined],
    [{ role: "DEPARTMENT_ADMIN" }, "programs", { status: "PUBLISHED", departmentSlug: OWN }, undefined, OWN],
  ];
  for (const [user, entity, payload, current, assigned] of cases) assert.equal(serverAllows(user, entity, payload, current, assigned), false, `${user.role} ${entity} ${JSON.stringify(payload)}`);
  for (const user of [SUPER, IET]) {
    for (const entity of entityValues) {
      const departmentSlug = departmentScoped.has(entity) ? OTHER : undefined;
      assert.equal(serverAllows(user, entity, { status: "PUBLISHED", departmentSlug }, undefined), true, `${user.role} ${entity}: create as published`);
      assert.equal(serverAllows(user, entity, { status: "DRAFT" }, { id: "r", status: "PUBLISHED", departmentSlug }), true, `${user.role} ${entity}: unpublish`);
      assert.equal(serverAllows(user, entity, { status: "ARCHIVED" }, { id: "r", status: "PUBLISHED", departmentSlug }), true, `${user.role} ${entity}: archive`);
      assert.equal(serverAllows(user, entity, { status: "DRAFT" }, { id: "r", status: "ARCHIVED", departmentSlug }), true, `${user.role} ${entity}: restore`);
    }
  }
});

test("the editor's buttons mirror the record-scoped authority: Publish and Unpublish appear exactly when the server would accept them", () => {
  const publishOffered = (user: PolicyUser, entity: EntityName, assigned?: string) => workflowActions(entityCapability(user, entity, assigned), "DRAFT").some((action) => action.status === "PUBLISHED");
  const unpublishOffered = (user: PolicyUser, entity: EntityName, assigned?: string) => workflowActions(entityCapability(user, entity, assigned), "PUBLISHED").some((action) => action.status === "DRAFT");
  const saveLiveOffered = (user: PolicyUser, entity: EntityName, assigned?: string) => workflowActions(entityCapability(user, entity, assigned), "PUBLISHED").some((action) => action.status === "PUBLISHED");
  for (const entity of scopedEntities) {
    assert.equal(publishOffered(DEPT, entity, OWN), true, `${entity}: own department → Publish`);
    assert.equal(unpublishOffered(DEPT, entity, OWN), true, `${entity}: own department → Unpublish`);
    assert.equal(saveLiveOffered(DEPT, entity, OWN), true, `${entity}: own department → Save changes on a live record`);
    assert.equal(publishOffered(DEPT, entity), false, `${entity}: unresolved department → no Publish`);
    assert.equal(saveLiveOffered(DEPT, entity), false, `${entity}: unresolved department → live record read-only`);
    assert.equal(publishOffered(EDITOR, entity), true, `${entity}: editor → Publish`);
    assert.equal(unpublishOffered(EDITOR, entity), false, `${entity}: editor → no Unpublish`);
    assert.equal(saveLiveOffered(EDITOR, entity), true, `${entity}: editor → Save changes on a live record`);
  }
  for (const entity of wideEntities) {
    assert.equal(publishOffered(DEPT, entity, OWN), false, `${entity}: department administrator → nothing`);
    assert.equal(publishOffered(EDITOR, entity), true, `${entity}: editor → Publish`);
    assert.equal(publishOffered(IET, entity), true);
    assert.equal(unpublishOffered(IET, entity), true);
  }
});

test("the routes hand the policy the server's own view of the record: entity, resulting department and the account's resolved department", () => {
  const content = readFileSync("app/api/admin/content/route.ts", "utf8");
  assert.match(content, /const assignedDepartmentSlug = user\.role === "DEPARTMENT_ADMIN" && user\.departmentId \? await getAssignedDepartmentSlug\(user\.departmentId\) : undefined;/);
  assert.match(content, /const scope: PublishScope = \{ entity, departmentSlug: data\.departmentSlug, assignedDepartmentSlug \};/, "POST: the department the new record names");
  assert.match(content, /const scope: PublishScope = \{ entity, departmentSlug: data\.departmentSlug === undefined \? current\.departmentSlug : data\.departmentSlug, assignedDepartmentSlug \};/, "PATCH: the department after the write");
  assert.match(content, /workflowTransitionAllowed\(user, undefined, data\.status, scope\)/);
  assert.match(content, /workflowTransitionAllowed\(user, current, data\.status, scope\)/);
  // Uploads: publishing a PDF on upload follows the same record-scoped authority.
  const upload = readFileSync("app/api/admin/media/upload/route.ts", "utf8");
  assert.match(upload, /assignedDepartmentSlug = department\.slug;/, "resolved from the database, never from the form");
  assert.match(upload, /const scope: PublishScope = \{ entity: "documents", departmentSlug, assignedDepartmentSlug \};/);
  assert.match(upload, /status === "ARCHIVED" \|\| \(status === "PUBLISHED" && !canPublish\(user, scope\)\)/);
  // The admin page derives the buttons from the same resolved department.
  const page = readFileSync("app/admin/(app)/content/[entity]/page.tsx", "utf8");
  assert.match(page, /const assignedDepartmentSlug = await assignedDepartmentSlugFor\(user\.departmentId\);/);
  assert.match(page, /entityCapability\(user, entity as EntityName, assignedDepartmentSlug\)/);
});

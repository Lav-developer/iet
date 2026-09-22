import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canConfigureDepartmentContacts,
  canManageUsers,
  canPublishInstitutionWideNotice,
  canViewAuditLogs,
  departmentScoped,
  entityCapability,
  entityValues,
  visibleAdminSections,
  visibleEntities,
} from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const EDITOR: PolicyUser = { role: "EDITOR" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-cse" };
const DEPT_NO_SCOPE: PolicyUser = { role: "DEPARTMENT_ADMIN" };

test("SUPER_ADMIN keeps the full institutional CMS", () => {
  assert.deepEqual(visibleAdminSections(SUPER), ["dashboard", "audit", "users", "departmentContacts"]);
  assert.equal(canManageUsers(SUPER), true);
  assert.equal(canViewAuditLogs(SUPER), true);
  const entities = visibleEntities(SUPER);
  assert.deepEqual(entities.map((capability) => capability.entity), [...entityValues]);
  assert.ok(entities.every((capability) => capability.canCreate && capability.canDelete));
});

test("IET_ADMIN keeps the institutional areas it is authorized for, without super-admin-only controls", () => {
  assert.deepEqual(visibleAdminSections(IET), ["dashboard", "audit", "users", "departmentContacts"]);
  assert.equal(canManageUsers(IET), true);
  assert.equal(canViewAuditLogs(IET), true);
  // Institute-wide content stays available…
  assert.deepEqual(visibleEntities(IET).map((capability) => capability.entity), [...entityValues]);
  // …but granting super-administrator access is not offered (the API refuses it).
  const usersScreen = readFileSync("components/users-admin.tsx", "utf8");
  assert.match(usersScreen, /adminRolesFor\(actor\)/);
  assert.doesNotMatch(usersScreen, /adminRoles\.map/);
});

test("DEPARTMENT_ADMIN only sees their department's scoped sections", () => {
  assert.deepEqual(visibleAdminSections(DEPT), ["dashboard", "departmentContacts"]);
  assert.equal(canManageUsers(DEPT), false);
  assert.equal(canViewAuditLogs(DEPT), false);
  const entities = visibleEntities(DEPT).map((capability) => capability.entity);
  assert.deepEqual(entities, [...departmentScoped]);
  for (const entity of ["departments", "researchAreas", "pages", "links", "contacts", "settings", "media"] as const) {
    assert.equal(entities.includes(entity), false, `${entity} is institution-wide`);
  }
  // Every scoped entity may be created, none deleted (existing policy).
  for (const capability of visibleEntities(DEPT)) {
    assert.equal(capability.canCreate, true);
    assert.equal(capability.canDelete, false);
  }
  // Notices stay available to a department administrator.
  assert.ok(entities.includes("notices"));
});

test("a DEPARTMENT_ADMIN without an assigned department gets no sections, and no other department's data", () => {
  assert.deepEqual(visibleAdminSections(DEPT_NO_SCOPE), ["dashboard"]);
  assert.deepEqual(visibleEntities(DEPT_NO_SCOPE), []);
  assert.equal(entityCapability(DEPT_NO_SCOPE, "notices").canCreate, false);
  assert.equal(canConfigureDepartmentContacts(DEPT_NO_SCOPE, "computer-science-engineering", "computer-science-engineering"), false);
});

test("EDITOR keeps institutional content editing and is offered no administrative areas", () => {
  assert.deepEqual(visibleAdminSections(EDITOR), ["dashboard"]);
  assert.equal(canManageUsers(EDITOR), false);
  assert.equal(canViewAuditLogs(EDITOR), false);
  const entities = visibleEntities(EDITOR).map((capability) => capability.entity);
  assert.deepEqual(entities, [...entityValues], "the existing institution-wide editorial scope is preserved");
  for (const capability of visibleEntities(EDITOR)) {
    assert.equal(capability.canDelete, false, "editors never delete");
  }
});

test("entity capabilities never offer what the workflow would reject", () => {
  assert.deepEqual(entityCapability(EDITOR, "notices").createStatusOptions, ["DRAFT", "REVIEW"]);
  assert.deepEqual(entityCapability(EDITOR, "notices").editStatusOptions, ["DRAFT", "REVIEW"]);
  assert.equal(entityCapability(EDITOR, "notices").canPublish, false);
  assert.deepEqual(entityCapability(DEPT, "notices").editStatusOptions, ["DRAFT", "REVIEW"]);
  assert.equal(entityCapability(DEPT, "notices").canPublish, false);
  // Publishing roles publish directly: a new record may be created as PUBLISHED.
  assert.deepEqual(entityCapability(SUPER, "notices").createStatusOptions, ["DRAFT", "REVIEW", "PUBLISHED"]);
  assert.equal(entityCapability(SUPER, "notices").canPublish, true);
  assert.equal(entityCapability({ role: "IET_ADMIN" }, "notices").canPublish, true);
  assert.equal(entityCapability(DEPT, "notices", "computer-science-engineering").fixedDepartmentSlug, "computer-science-engineering");
  // Without a resolvable department the editor must not invent one.
  assert.equal(entityCapability(DEPT, "notices").fixedDepartmentSlug, undefined);
  assert.deepEqual(entityCapability(SUPER, "notices").editStatusOptions, ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);
  // Non-scoped entities carry no department for a department administrator.
  assert.equal(entityCapability(DEPT, "pages").fixedDepartmentSlug, undefined);
  assert.equal(entityCapability(DEPT, "pages").canCreate, false);
});

test("the workspace navigation is derived from the shared policy, not a second role list", () => {
  const shell = readFileSync("components/admin-shell.tsx", "utf8");
  assert.match(shell, /visibleEntities\(user\)/);
  assert.match(shell, /visibleAdminSections\(user\)/);
  assert.match(shell, /canManageUsers\(user\)/);
  assert.match(shell, /canViewAuditLogs\(user\)/);
  assert.doesNotMatch(shell, /role === "DEPARTMENT_ADMIN"|role === "EDITOR"/, "no duplicated role definitions in the shell");
  // Notices remain part of the content list for every role that can read it.
  assert.match(shell, /\["notices", "Notices", Newspaper\]/);
});

test("administrative pages are gated on the server, and the APIs stay authoritative", () => {
  const gate = readFileSync("lib/admin-sections.ts", "utf8");
  assert.match(gate, /requireAdminSection/);
  for (const section of ["users", "audit"] as const) {
    assert.match(gate, new RegExp(`section === "${section}"`));
  }
  for (const page of ["app/admin/(app)/users/page.tsx", "app/admin/(app)/audit/page.tsx", "app/admin/(app)/department-contacts/page.tsx"]) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /requireAdminSection\(/, `${page} must be server-gated`);
  }
  // The APIs still authorize independently of what the UI rendered.
  assert.match(readFileSync("app/api/admin/users/route.ts", "utf8"), /actor\.role !== "SUPER_ADMIN" && actor\.role !== "IET_ADMIN"/);
  assert.match(readFileSync("app/api/admin/audit/route.ts", "utf8"), /user\.role !== "SUPER_ADMIN" && user\.role !== "IET_ADMIN"/);
  assert.match(readFileSync("app/api/admin/content/route.ts", "utf8"), /canAccess\(user, entity/);
  assert.match(readFileSync("app/api/admin/department-contacts/route.ts", "utf8"), /canConfigureDepartmentContacts\(/);
});

test("notice creation remains available to all four roles", () => {
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "EDITOR"] as const) {
    assert.equal(visibleEntities({ role }).some((capability) => capability.entity === "notices"), true, role);
    assert.equal(canPublishInstitutionWideNotice({ role }), true, role);
  }
  assert.equal(visibleEntities(DEPT).some((capability) => capability.entity === "notices"), true);
  // Only institute-wide roles get the institution-wide notice option.
  assert.equal(canPublishInstitutionWideNotice(DEPT), false);
  assert.equal(canPublishInstitutionWideNotice(DEPT_NO_SCOPE), false);
});

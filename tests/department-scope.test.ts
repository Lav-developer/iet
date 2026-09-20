import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { departmentScoped, entityValues } from "../lib/content-policy";
import { seedData } from "../data/seed";

const store = readFileSync("lib/store.ts", "utf8");
const contentRoute = readFileSync("app/api/admin/content/route.ts", "utf8");
const contactsRoute = readFileSync("app/api/admin/department-contacts/route.ts", "utf8");

test("department scoping is applied inside the database query for every department-owned entity", () => {
  const scoped = [...store.matchAll(/scopedDepartmentWhere\("(\w+)", scope\)/g)].map((match) => match[1]);
  assert.deepEqual([...scoped].sort(), [...departmentScoped].sort(), "every department-owned entity is scoped, and only those");
  // A scope never silently filters institution-wide collections.
  const scopeHelper = store.slice(store.indexOf("function scopedDepartmentWhere"), store.indexOf("function scopedDepartmentWhere") + 400);
  assert.match(scopeHelper, /departmentScoped\.has\(entity\) \? \{ department: \{ slug: scope\.departmentSlug \} \} : \{\}/);
  for (const entity of ["pages", "links", "contacts", "settings", "media"]) {
    assert.equal(departmentScoped.has(entity), false, `${entity} is institution-wide`);
  }
});

test("the admin content list passes the session's department to the query layer, never a client value", () => {
  assert.match(contentRoute, /getEntity\(entity, true, user\.role === "DEPARTMENT_ADMIN" \? \{ departmentSlug: await getAssignedDepartmentSlug\(user\.departmentId\) \} : undefined\)/);
  assert.doesNotMatch(contentRoute, /records\.filter\(\(record\)/, "no post-fetch filtering of another department's rows");
  assert.doesNotMatch(contentRoute, /searchParams\.get\("departmentSlug"\)/);
  assert.match(contentRoute, /if \(user\.role === "DEPARTMENT_ADMIN" && !departmentScoped\.has\(entity\)\) return NextResponse\.json\(\{ error: "Your role is scoped to department content\." \}, \{ status: 403 \}\)/);
});

test("writes remain authorized record-by-record with the assigned department", () => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.match(contentRoute, new RegExp(`export async function ${method}`));
  }
  assert.match(contentRoute, /canAccess\(user, entity, "write", data, current, assignedDepartmentSlug\)/);
  assert.match(contentRoute, /canAccess\(user, entity, "delete", undefined, current, assignedDepartmentSlug\)/);
  assert.match(readFileSync("lib/content-policy.ts", "utf8"), /requestedDepartment !== assignedDepartmentSlug/);
});

test("the department-contact API resolves the department from the session and refuses any other one", () => {
  assert.match(contactsRoute, /const target = isDepartmentAdmin \? actor\.departmentId : requested \|\| actor\.departmentId;/);
  assert.match(contactsRoute, /if \(isDepartmentAdmin && requested && requested !== actor\.departmentId\)/);
  assert.match(contactsRoute, /status: 403/);
  assert.match(contactsRoute, /canConfigureDepartmentContacts\(actor, store\.department\.slug, slug\)/);
  // The selected person is checked against that department's own faculty.
  assert.match(readFileSync("lib/store.ts", "utf8"), /A selected person does not belong to this department/);
});

test("the faculty selector only receives the selected department's people", () => {
  const reader = store.slice(store.indexOf("export async function getDepartmentContactConfig"), store.indexOf("export async function replaceDepartmentContacts"));
  assert.match(reader, /prisma\.facultyMember\.findMany\(\{ where: \{ departmentId: department\.id \}/);
  assert.doesNotMatch(reader, /facultyMember\.findMany\(\{\s*\}\)/, "never the whole faculty table");
  // And the client never asks for another department's faculty either.
  const screen = readFileSync("components/department-contacts.tsx", "utf8");
  assert.match(screen, /fetch\(`\/api\/admin\/department-contacts\?departmentId=\$\{encodeURIComponent\(targetDepartmentId\)\}`\)/);
  assert.doesNotMatch(screen, /entity=faculty/);
});

test("a department administrator's dashboard counters are scoped in the aggregate query", () => {
  const summary = store.slice(store.indexOf("export async function getDashboardSummary"), store.indexOf("export async function getEntity"));
  assert.match(summary, /groupBy\(\{ by: \["status"\], _count: \{ _all: true \}, \.\.\.\(departmentId \? \{ where: \{ id: departmentId \} \} : \{\}\) \}\)/);
  assert.match(summary, /const departmentWhere = departmentId \? \{ departmentId \} : \{\};/);
  assert.match(readFileSync("app/api/admin/summary/route.ts", "utf8"), /user\.role === "DEPARTMENT_ADMIN" && user\.departmentId/);
});

test("institution-wide entities are never given an arbitrary department filter", () => {
  const configs = readFileSync("components/entity-manager.tsx", "utf8");
  // The department picker is only rendered for fields that exist; institution-
  // wide entities have no such field at all.
  for (const entity of ["pages", "links", "contacts", "settings", "media"]) {
    const start = configs.indexOf(`${entity}: { title:`);
    const end = configs.indexOf("] },", start);
    const block = configs.slice(start, end);
    assert.doesNotMatch(block, /key: "departmentSlug"/, `${entity} has no department field`);
  }
  for (const entity of ["notices", "faculty", "programs", "documents"]) {
    const start = configs.indexOf(`${entity}: { title:`);
    const end = configs.indexOf("] },", start);
    assert.match(configs.slice(start, end), /key: "departmentSlug", label: "Department/, `${entity} chooses a department by name`);
  }
});

test("the seeded departments keep their configured contacts and no contact is inferred from ordering", () => {
  const configured = seedData.departments.filter((department) => (department.contacts || []).length > 0);
  assert.equal(configured.length, seedData.departments.length);
  const totalContacts = seedData.departments.reduce((sum, department) => sum + (department.contacts || []).length, 0);
  assert.ok(totalContacts >= 6);
  // No code path derives a contact from a position in a list.
  const publicContent = readFileSync("lib/public-content.ts", "utf8");
  assert.doesNotMatch(publicContent, /selectDepartmentContact\b/);
  assert.doesNotMatch(publicContent, /people\[0\]|faculty\[0\]/);
});

test("the migration adds the contact table and backfills it without touching existing data", () => {
  const migration = readFileSync("prisma/migrations/0007_department_contacts/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "DepartmentContact"/);
  assert.match(migration, /FOREIGN KEY \("facultyId"\) REFERENCES "FacultyMember"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /INSERT INTO "DepartmentContact"/);
  assert.match(migration, /ON CONFLICT \("departmentId", "facultyId"\) DO NOTHING/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN|DELETE FROM/);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model DepartmentContact/);
  assert.match(schema, /contacts\s+DepartmentContact\[\]/);
});

test("every configured contact person is a published member of that department in the fixture", () => {
  for (const department of seedData.departments) {
    for (const contact of department.contacts || []) {
      const person = seedData.faculty.find((item) => item.slug === contact.facultySlug);
      assert.ok(person, `${contact.facultySlug} exists`);
      assert.equal(person?.departmentSlug, department.slug);
      assert.equal(person?.status, "PUBLISHED");
      assert.equal(departmentScoped.has("faculty"), true);
    }
  }
  // Institution-wide entity list is unchanged by this work.
  assert.equal(entityValues.length, 17);
});

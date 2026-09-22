import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCOUNT_ERRORS, adminRoles, authorizeAccountCreation, authorizeAccountUpdate, departmentScopedRole, isAdminRole, resolveDepartmentAssignment, roleScopeLabel } from "../lib/user-roles";
import { DepartmentSelect } from "../components/department-select";

Object.assign(globalThis, { React });

// Stand-in for the database lookup: only these departments exist.
const existing = new Set(["dept-cse", "dept-civil", "dept-eee"]);
const departmentExists = async (id: string) => existing.has(id);
const calls: string[] = [];
const trackingExists = async (id: string) => { calls.push(id); return existing.has(id); };

const resolve = (role: string, departmentId?: string | null, currentDepartmentId?: string | null) =>
  resolveDepartmentAssignment({ role, departmentId, currentDepartmentId }, departmentExists);

test("the four administrator roles are the only accepted roles", () => {
  assert.deepEqual([...adminRoles], ["SUPER_ADMIN", "IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"]);
  for (const role of adminRoles) assert.equal(isAdminRole(role), true);
  for (const value of ["", "ADMIN", "SUPER_ADMIN ", null, undefined, 7]) assert.equal(isAdminRole(value), false);
  assert.equal(departmentScopedRole("DEPARTMENT_ADMIN"), true);
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "EDITOR"]) assert.equal(departmentScopedRole(role), false);
});

test("CREATE — SUPER_ADMIN and IET_ADMIN are institute-wide and must have a null departmentId", async () => {
  for (const role of ["SUPER_ADMIN", "IET_ADMIN"]) {
    assert.deepEqual(await resolve(role), { ok: true, departmentId: null }, `${role} without a department`);
    assert.deepEqual(await resolve(role, null), { ok: true, departmentId: null }, `${role} with an explicit null`);
    assert.deepEqual(await resolve(role, ""), { ok: true, departmentId: null }, `${role} with an empty string`);
    const rejected = await resolve(role, "dept-cse");
    assert.equal(rejected.ok, false, `${role} must not be assigned a department`);
    assert.match((rejected as { error: string }).error, /institute-wide/);
  }
});

test("CREATE — EDITOR is institute-wide by default and must have a null departmentId", async () => {
  assert.deepEqual(await resolve("EDITOR"), { ok: true, departmentId: null });
  assert.deepEqual(await resolve("EDITOR", null), { ok: true, departmentId: null });
  const rejected = await resolve("EDITOR", "dept-cse");
  assert.equal(rejected.ok, false);
  assert.match((rejected as { error: string }).error, /only valid for department administrators/);
});

test("CREATE — DEPARTMENT_ADMIN requires a department that exists", async () => {
  assert.deepEqual(await resolve("DEPARTMENT_ADMIN", "dept-cse"), { ok: true, departmentId: "dept-cse" });
  // The internal id is stored, and surrounding whitespace is tolerated.
  assert.deepEqual(await resolve("DEPARTMENT_ADMIN", "  dept-civil  "), { ok: true, departmentId: "dept-civil" });
  for (const missing of [undefined, null, "", "   "]) {
    const rejected = await resolve("DEPARTMENT_ADMIN", missing);
    assert.equal(rejected.ok, false, `a department administrator needs a department (${String(missing)})`);
    assert.match((rejected as { error: string }).error, /A department is required/);
  }
  const unknown = await resolve("DEPARTMENT_ADMIN", "dept-does-not-exist");
  assert.equal(unknown.ok, false);
  assert.match((unknown as { error: string }).error, /Department not found/);
});

test("UPDATE — a department administrator keeps or changes its department, and an unknown id is rejected", async () => {
  // Unchanged: no departmentId in the payload keeps the stored scope.
  assert.deepEqual(await resolve("DEPARTMENT_ADMIN", undefined, "dept-cse"), { ok: true, departmentId: "dept-cse" });
  // Changing to another valid department.
  assert.deepEqual(await resolve("DEPARTMENT_ADMIN", "dept-eee", "dept-cse"), { ok: true, departmentId: "dept-eee" });
  // Clearing it is not allowed while the account stays a department administrator.
  const cleared = await resolve("DEPARTMENT_ADMIN", null, "dept-cse");
  assert.equal(cleared.ok, false);
  assert.match((cleared as { error: string }).error, /A department is required/);
  const unknown = await resolve("DEPARTMENT_ADMIN", "dept-unknown", "dept-cse");
  assert.equal(unknown.ok, false);
  assert.match((unknown as { error: string }).error, /Department not found/);
});

test("UPDATE — switching a department administrator to an institute-wide role clears the stale scope", async () => {
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "EDITOR"]) {
    assert.deepEqual(await resolve(role, undefined, "dept-cse"), { ok: true, departmentId: null }, `${role}: stale scope cleared`);
    assert.deepEqual(await resolve(role, null, "dept-cse"), { ok: true, departmentId: null }, `${role}: explicit null clears`);
    const rejected = await resolve(role, "dept-civil", "dept-cse");
    assert.equal(rejected.ok, false, `${role}: cannot hold a department`);
  }
});

test("UPDATE — an institute-wide account cannot be given a department, and existing nulls stay null", async () => {
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "EDITOR"]) {
    assert.deepEqual(await resolve(role, undefined, null), { ok: true, departmentId: null });
    assert.deepEqual(await resolve(role, null, null), { ok: true, departmentId: null });
    assert.equal((await resolve(role, "dept-cse", null)).ok, false);
  }
});

test("the department lookup runs only when a department is actually assigned", async () => {
  calls.length = 0;
  await resolveDepartmentAssignment({ role: "IET_ADMIN", departmentId: null }, trackingExists);
  await resolveDepartmentAssignment({ role: "EDITOR", departmentId: undefined, currentDepartmentId: null }, trackingExists);
  assert.deepEqual(calls, [], "institute-wide roles never query the department table");
  calls.length = 0;
  await resolveDepartmentAssignment({ role: "DEPARTMENT_ADMIN", departmentId: "dept-cse" }, trackingExists);
  assert.deepEqual(calls, ["dept-cse"]);
  calls.length = 0;
  await resolveDepartmentAssignment({ role: "DEPARTMENT_ADMIN", departmentId: undefined }, trackingExists);
  assert.deepEqual(calls, [], "a missing department is rejected before any lookup");
});

test("account scope labels describe each role honestly", () => {
  assert.equal(roleScopeLabel("DEPARTMENT_ADMIN", "Department of Civil Engineering"), "Department of Civil Engineering");
  assert.equal(roleScopeLabel("DEPARTMENT_ADMIN", null), "Department not assigned");
  for (const role of ["SUPER_ADMIN", "IET_ADMIN", "EDITOR"]) assert.equal(roleScopeLabel(role, "ignored"), "Institute-wide");
});

test("the users API applies the shared policy to create and update, and stores the internal id", () => {
  const route = readFileSync("app/api/admin/users/route.ts", "utf8");
  assert.match(route, /import \{ authorizeAccountCreation, authorizeAccountDeactivation, authorizeAccountUpdate, resolveDepartmentAssignment \} from "@\/lib\/user-roles"/);
  assert.match(route, /resolveDepartmentAssignment\(\{ role, departmentId, currentDepartmentId \}/);
  assert.match(route, /departmentId: assignment\.departmentId/, "the resolved internal id is what gets stored");
  // The inline rules it replaces are gone.
  assert.doesNotMatch(route, /input\.role === "DEPARTMENT_ADMIN" && !input\.departmentId/);
  assert.doesNotMatch(route, /resultingDepartmentId === undefined \? target\.departmentId/);
  // Null is accepted for institute-wide roles.
  assert.match(route, /const departmentIdSchema = z\.string\(\)\.trim\(\)\.max\(200\)\.nullable\(\)\.optional\(\)/);
  // RBAC is untouched: only SUPER_ADMIN / IET_ADMIN reach the handlers, and
  // every write is gated by the shared account decision (lib/user-roles),
  // which refuses an IET administrator creating a super administrator or
  // touching a super administrator account.
  assert.match(route, /if \(actor\.role !== "SUPER_ADMIN" && actor\.role !== "IET_ADMIN"\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
  assert.match(route, /const decision = authorizeAccountCreation\(actor, input\.role\)/);
  assert.match(route, /const decision = authorizeAccountUpdate\(actor, target, body\.data\)/);
  assert.match(route, /const decision = authorizeAccountDeactivation\(actor, target\)/);
  assert.equal(authorizeAccountCreation({ id: "iet", role: "IET_ADMIN" }, "SUPER_ADMIN").ok, false);
  assert.match(ACCOUNT_ERRORS.createSuperAdmin, /IET administrators cannot create super administrators/);
  assert.equal(authorizeAccountUpdate({ id: "iet", role: "IET_ADMIN" }, { id: "super", role: "SUPER_ADMIN" }, { name: "x" }).ok, false);
  assert.match(ACCOUNT_ERRORS.notManageable, /You cannot modify this administrator/);
});

test("the admin UI shows the department selector only for DEPARTMENT_ADMIN, in create and edit", () => {
  const page = readFileSync("components/users-admin.tsx", "utf8");
  assert.match(page, /\{form\.role === "DEPARTMENT_ADMIN" && <DepartmentSelect/, "create flow is role-conditional");
  assert.match(page, /\{editing\.role === "DEPARTMENT_ADMIN" && <DepartmentSelect/, "edit flow is role-conditional");
  assert.equal((page.match(/<DepartmentSelect/g) || []).length, 2, "exactly one selector per flow");
  // The raw internal-id input is gone.
  assert.doesNotMatch(page, /Department ID/);
  assert.doesNotMatch(page, /id="user-department" className="form-control"/);
  // Non-department roles submit null explicitly.
  assert.match(page, /form\.role === "DEPARTMENT_ADMIN" \? form\.departmentId \|\| null : null/);
  assert.match(page, /editing\.role === "DEPARTMENT_ADMIN" \? editing\.departmentId \|\| null : null/);
  // Changing the role resets a previously selected department.
  assert.equal((page.match(/role: event\.target\.value, departmentId: ""/g) || []).length, 2);
  // Editing an existing account is possible at all.
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /roleScopeLabel\(user\.role, user\.department\?\.name\)/);
});

test("the selector searches by name, submits the internal id and is keyboard accessible", () => {
  const source = readFileSync("components/department-select.tsx", "utf8");
  assert.match(source, /role="combobox"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-activedescendant=/);
  assert.match(source, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onChange\(option\.id\)/, "selecting an option submits the department id");
  assert.match(source, /Search departments by name/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/, "no client-side persistence of scope");

  // Rendered options use department names, never ids, as their visible label.
  const options = [{ id: "dept-cse", name: "Department of Computer Science and Engineering" }, { id: "dept-civil", name: "Department of Civil Engineering" }];
  const html = renderToStaticMarkup(React.createElement(DepartmentSelect, { value: "dept-civil", onChange: () => {}, options, required: true }));
  assert.match(html, /Department of Civil Engineering/);
  assert.match(html, /role="combobox"/);
  assert.doesNotMatch(html, /dept-cse/, "internal ids are never shown as the visible value");
  assert.match(html, /aria-required="true"|required/);
});

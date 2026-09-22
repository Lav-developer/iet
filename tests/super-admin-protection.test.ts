import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACCOUNT_ERRORS,
  authorizeAccountCreation,
  authorizeAccountDeactivation,
  authorizeAccountUpdate,
  canChangeAccountRole,
  canManageAccounts,
} from "../lib/user-roles";
import { AccountRowActions } from "../components/account-actions";

Object.assign(globalThis, { React });

// Reported: "IET admin is able to change super admin role and new password".
// These tests pin the server decision the users API applies to the *stored*
// target, and the Users screen controls that used to offer the change.

const superAdmin = { id: "u-super", role: "SUPER_ADMIN" };
const otherSuperAdmin = { id: "u-super-2", role: "SUPER_ADMIN" };
const ietAdmin = { id: "u-iet", role: "IET_ADMIN" };
const otherIetAdmin = { id: "u-iet-2", role: "IET_ADMIN" };
const departmentAdmin = { id: "u-dept", role: "DEPARTMENT_ADMIN" };
const editor = { id: "u-editor", role: "EDITOR" };

const refused = (decision: ReturnType<typeof authorizeAccountUpdate>) => (decision.ok ? null : decision);

test("SERVER — an IET administrator cannot change a super administrator's password", () => {
  const decision = refused(authorizeAccountUpdate(ietAdmin, superAdmin, { password: "New-Passw0rd!2026" }));
  assert.ok(decision, "must be refused");
  assert.equal(decision.status, 403);
  assert.equal(decision.error, ACCOUNT_ERRORS.notManageable);
});

test("SERVER — an IET administrator cannot change a super administrator's role, name or status", () => {
  for (const change of [
    { role: "IET_ADMIN" },
    { role: "EDITOR" },
    { role: "SUPER_ADMIN" }, // even re-sending the unchanged role is refused
    { name: "Renamed" },
    { active: false },
    { active: true },
    { departmentId: null },
    {},
  ]) {
    const decision = refused(authorizeAccountUpdate(ietAdmin, superAdmin, change));
    assert.ok(decision, `${JSON.stringify(change)} must be refused`);
    assert.equal(decision.status, 403);
    assert.equal(decision.error, ACCOUNT_ERRORS.notManageable);
  }
  const deactivation = refused(authorizeAccountDeactivation(ietAdmin, superAdmin));
  assert.ok(deactivation);
  assert.equal(deactivation.status, 403);
});

test("SERVER — an IET administrator cannot escalate any account to super administrator, or create one", () => {
  for (const target of [otherIetAdmin, departmentAdmin, editor]) {
    const decision = refused(authorizeAccountUpdate(ietAdmin, target, { role: "SUPER_ADMIN" }));
    assert.ok(decision, `${target.role} → SUPER_ADMIN must be refused`);
    assert.equal(decision.status, 403);
    assert.equal(decision.error, ACCOUNT_ERRORS.grantSuperAdmin);
  }
  const self = refused(authorizeAccountUpdate(ietAdmin, ietAdmin, { role: "SUPER_ADMIN" }));
  assert.ok(self);
  assert.equal(self.status, 403);
  const creation = refused(authorizeAccountCreation(ietAdmin, "SUPER_ADMIN"));
  assert.ok(creation);
  assert.equal(creation.status, 403);
  assert.equal(creation.error, ACCOUNT_ERRORS.createSuperAdmin);
});

test("SERVER — an IET administrator still manages the accounts it is responsible for", () => {
  for (const target of [otherIetAdmin, departmentAdmin, editor]) {
    assert.deepEqual(authorizeAccountUpdate(ietAdmin, target, { password: "New-Passw0rd!2026" }), { ok: true });
    assert.deepEqual(authorizeAccountUpdate(ietAdmin, target, { name: "Renamed", active: false }), { ok: true });
    assert.deepEqual(authorizeAccountUpdate(ietAdmin, target, { role: "EDITOR" }), { ok: true });
    assert.deepEqual(authorizeAccountDeactivation(ietAdmin, target), { ok: true });
  }
  for (const role of ["IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"]) assert.deepEqual(authorizeAccountCreation(ietAdmin, role), { ok: true });
  // Its own name and password, but not its own status or role.
  assert.deepEqual(authorizeAccountUpdate(ietAdmin, ietAdmin, { name: "Me", password: "New-Passw0rd!2026" }), { ok: true });
  assert.equal(refused(authorizeAccountUpdate(ietAdmin, ietAdmin, { active: false }))?.error, ACCOUNT_ERRORS.selfDeactivate);
  assert.equal(refused(authorizeAccountUpdate(ietAdmin, ietAdmin, { role: "EDITOR" }))?.error, ACCOUNT_ERRORS.selfRole);
});

test("SERVER — super administrators manage every account, except their own role and status", () => {
  for (const target of [otherSuperAdmin, ietAdmin, departmentAdmin, editor]) {
    assert.deepEqual(authorizeAccountUpdate(superAdmin, target, { password: "New-Passw0rd!2026", role: "IET_ADMIN" }), { ok: true });
    assert.deepEqual(authorizeAccountUpdate(superAdmin, target, { role: "SUPER_ADMIN" }), { ok: true });
    assert.deepEqual(authorizeAccountDeactivation(superAdmin, target), { ok: true });
  }
  assert.deepEqual(authorizeAccountCreation(superAdmin, "SUPER_ADMIN"), { ok: true });
  // Re-sending the unchanged role on its own account is fine; changing it is not.
  assert.deepEqual(authorizeAccountUpdate(superAdmin, superAdmin, { name: "Me", role: "SUPER_ADMIN" }), { ok: true });
  const demote = refused(authorizeAccountUpdate(superAdmin, superAdmin, { role: "IET_ADMIN" }));
  assert.equal(demote?.status, 400);
  assert.equal(demote?.error, ACCOUNT_ERRORS.selfRole);
  const deactivate = refused(authorizeAccountUpdate(superAdmin, superAdmin, { active: false }));
  assert.equal(deactivate?.status, 400);
  assert.equal(deactivate?.error, ACCOUNT_ERRORS.selfDeactivate);
  assert.equal(refused(authorizeAccountDeactivation(superAdmin, superAdmin))?.status, 403);
});

test("SERVER — no other role manages accounts at all, and unknown roles are rejected", () => {
  for (const actor of [departmentAdmin, editor, null, undefined, { id: "x", role: "ADMIN" }]) {
    assert.equal(canManageAccounts(actor), false);
    assert.equal(refused(authorizeAccountUpdate(actor, editor, { password: "New-Passw0rd!2026" }))?.status, 403);
    assert.equal(refused(authorizeAccountDeactivation(actor, editor))?.status, 403);
    assert.equal(refused(authorizeAccountCreation(actor, "EDITOR"))?.status, 403);
  }
  assert.equal(refused(authorizeAccountUpdate(superAdmin, editor, { role: "OWNER" }))?.status, 400);
  assert.equal(refused(authorizeAccountCreation(superAdmin, "OWNER"))?.status, 400);
  // Refusals never leak anything beyond a status and a plain-language message.
  const decision = refused(authorizeAccountUpdate(ietAdmin, superAdmin, { password: "x" }));
  assert.deepEqual(Object.keys(decision!).sort(), ["error", "ok", "status"]);
});

test("SERVER — the users API applies these decisions on the stored target before hashing or writing", () => {
  const route = readFileSync("app/api/admin/users/route.ts", "utf8");
  assert.match(route, /import \{ authorizeAccountCreation, authorizeAccountDeactivation, authorizeAccountUpdate, resolveDepartmentAssignment \} from "@\/lib\/user-roles"/);
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  const del = route.slice(route.indexOf("export async function DELETE"), route.indexOf("function handleError"));

  assert.match(post, /const decision = authorizeAccountCreation\(actor, input\.role\);\s*if \(!decision\.ok\) return refusal\(decision\);/);
  assert.ok(post.indexOf("authorizeAccountCreation(") < post.indexOf("bcrypt.hash("), "create: decision before hashing");
  assert.ok(post.indexOf("authorizeAccountCreation(") < post.indexOf("$transaction"), "create: decision before writing");

  // The target is the stored row, looked up by id, never the client's claim about it.
  assert.match(patch, /const target = await prisma\.user\.findUnique\(\{ where: \{ id: body\.id \} \}\)/);
  assert.match(patch, /const decision = authorizeAccountUpdate\(actor, target, body\.data\);\s*if \(!decision\.ok\) return refusal\(decision\);/);
  assert.ok(patch.indexOf("authorizeAccountUpdate(") < patch.indexOf("bcrypt.hash("), "update: decision before hashing");
  assert.ok(patch.indexOf("authorizeAccountUpdate(") < patch.indexOf("$transaction"), "update: decision before writing");
  assert.ok(patch.indexOf("authorizeAccountUpdate(") < patch.indexOf("departmentAssignment("), "update: decision before any further lookup");

  assert.match(del, /const target = await prisma\.user\.findUnique\(\{ where: \{ id: body\.id \} \}\)/);
  assert.match(del, /const decision = authorizeAccountDeactivation\(actor, target\);\s*if \(!decision\.ok\) return refusal\(decision\);/);
  assert.ok(del.indexOf("authorizeAccountDeactivation(") < del.indexOf("$transaction"), "deactivate: decision before writing");

  // The actor is the database-backed session (role re-read on every request), and
  // no inline role comparison bypasses the shared rule.
  assert.match(route, /const actor = await requireAdmin\(\);/);
  assert.doesNotMatch(route, /function permitted\(/);
  assert.doesNotMatch(route, /body\.data\.role === "SUPER_ADMIN"/);
  assert.doesNotMatch(route, /input\.role === "SUPER_ADMIN"/);
  // The status/error pair returned is exactly the decision's.
  assert.match(route, /return NextResponse\.json\(\{ error: decision\.error \}, \{ status: decision\.status \}\)/);
});

test("SCREEN — an IET administrator gets no Edit or Deactivate button for a super administrator", () => {
  const superAccount = { id: "u-super", role: "SUPER_ADMIN", active: true };
  const html = renderToStaticMarkup(React.createElement(AccountRowActions, { actor: ietAdmin, account: superAccount, onEdit: () => undefined, onDeactivate: () => undefined }));
  assert.doesNotMatch(html, /<button/, "no action buttons at all");
  assert.doesNotMatch(html, /Edit|Deactivate/);
  assert.match(html, /Only a super administrator can change this account\./);
  assert.doesNotMatch(html, /u-super|SUPER_ADMIN/, "no internal identifiers or raw role values");
});

test("SCREEN — the buttons remain for accounts the signed-in administrator may manage", () => {
  const render = (actor: { id: string; role: string } | null, account: { id: string; role: string; active: boolean }) =>
    renderToStaticMarkup(React.createElement(AccountRowActions, { actor, account, onEdit: () => undefined, onDeactivate: () => undefined }));
  for (const account of [{ id: "u-iet-2", role: "IET_ADMIN", active: true }, { id: "u-dept", role: "DEPARTMENT_ADMIN", active: true }, { id: "u-editor", role: "EDITOR", active: true }]) {
    const html = render(ietAdmin, account);
    assert.match(html, /Edit/);
    assert.match(html, /Deactivate/);
  }
  // A super administrator manages another super administrator…
  assert.match(render(superAdmin, { id: "u-super-2", role: "SUPER_ADMIN", active: true }), /Edit[\s\S]*Deactivate/);
  // …but never deactivates itself, and an inactive account offers only Edit.
  const self = render(superAdmin, { id: "u-super", role: "SUPER_ADMIN", active: true });
  assert.match(self, /Edit/);
  assert.doesNotMatch(self, /Deactivate/);
  assert.doesNotMatch(render(ietAdmin, { id: "u-editor", role: "EDITOR", active: false }), /Deactivate/);
  // Before the session is known nothing is offered.
  assert.doesNotMatch(render(null, { id: "u-editor", role: "EDITOR", active: true }), /<button/);
});

test("SCREEN — the editor never shows a role dropdown that displays a different role, or one for the signed-in account", () => {
  // The dropdown used to be built from adminRolesFor(actor), which for an IET
  // administrator has no SUPER_ADMIN entry; a super administrator's editor
  // therefore rendered with "IET ADMIN" pre-selected as if the role had changed.
  assert.equal(canChangeAccountRole(ietAdmin, superAdmin), false);
  assert.equal(canChangeAccountRole(ietAdmin, ietAdmin), false, "own role is never editable");
  assert.equal(canChangeAccountRole(superAdmin, superAdmin), false, "own role is never editable");
  assert.equal(canChangeAccountRole(ietAdmin, editor), true);
  assert.equal(canChangeAccountRole(superAdmin, otherSuperAdmin), true);
  assert.equal(canChangeAccountRole(null, editor), false);

  const screen = readFileSync("components/users-admin.tsx", "utf8");
  assert.match(screen, /import \{ AccountRowActions \} from "@\/components\/account-actions"/);
  assert.match(screen, /<AccountRowActions actor=\{actor\} account=\{user\}/);
  assert.doesNotMatch(screen, /<button className="mini-button" onClick=\{\(\) => \{ setError\(""\); setMessage\(""\); setEditing/, "the unconditional Edit button is gone");
  assert.match(screen, /canChangeAccountRole\(actor, \{ id: editing\.id, role: editing\.role \}\) && roleOptions\.includes\(editing\.role\)\s*\? <div className="form-field"><label htmlFor="edit-role">Role<\/label><select/);
  assert.match(screen, /const roleOptions: string\[\] = editing \? adminRolesFor\(actor, editing\.role\) : \[\]/);
  assert.match(screen, /You cannot change your own role\. Ask a super administrator to change it\./);
  assert.match(screen, /Only a super administrator can change this role\./);
});

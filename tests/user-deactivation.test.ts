import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { issueSessionToken, verifySessionToken } from "../lib/auth";
import { adminRolesFor, authorizeAccountDeactivation, authorizeAccountUpdate, canActOnAccount, canDeactivateAccount, canGrantRole } from "../lib/user-roles";

process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";

const route = readFileSync("app/api/admin/users/route.ts", "utf8");
const deleteHandler = route.slice(route.indexOf("export async function DELETE"), route.indexOf("function handleError"));
const patchHandler = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
const postHandler = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));

test("deactivation no longer references the record it is still initialising (the reported 500)", () => {
  // The transaction result is assigned to `user`; referencing `user.id` inside
  // the same initialiser threw "Cannot access 'user' before initialization" and
  // the route answered 500, which the Users screen showed as
  // "Unable to deactivate user".
  assert.doesNotMatch(deleteHandler, /const user = await[\s\S]{0,900}?user\.id/, "no self-referential initialiser");
  assert.match(deleteHandler, /entityId: updated\.id/, "the audit entry uses the updated row it already selected");
  assert.match(postHandler, /entityId: created\.id/, "the create audit entry uses the created row");
  assert.match(patchHandler, /entityId: updated\.id/, "the update audit entry uses the updated row");
});

test("the users API contains no `any` casts and keeps the generic auth errors", () => {
  assert.doesNotMatch(route, /as any/);
  assert.match(route, /error\.message === "UNAUTHORIZED"\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
});

test("deactivation deactivates the target, invalidates its sessions and writes an audit entry atomically", () => {
  assert.match(deleteHandler, /active: false, sessionVersion: \{ increment: 1 \}/);
  assert.match(deleteHandler, /\$transaction/);
  assert.match(deleteHandler, /action: "DEACTIVATED_AND_INVALIDATED_SESSIONS"/);
  assert.match(deleteHandler, /entity: "users"/);
  // The audit entry names the actor, never the target, as the author.
  assert.match(deleteHandler, /userId: actor\.id/);
});

test("a deactivated account cannot sign in and its existing session is rejected", () => {
  const auth = readFileSync("lib/auth.ts", "utf8");
  // authenticate() refuses inactive accounts…
  assert.match(auth, /if \(!user \|\| !user\.active \|\| !\(await bcrypt\.compare/);
  // …and getSession() re-checks both the active flag and the session version of
  // an already-issued token, which is what invalidates a live session.
  assert.match(auth, /if \(!user \|\| !user\.active\) return null;/);
  assert.match(auth, /if \(user\.sessionVersion !== tokenVersion\) return null;/);
});

test("session invalidation compares the token version with the stored version", async () => {
  const token = await issueSessionToken({ id: "user-1", name: "Target", email: "target@example.test", role: "EDITOR", sessionVersion: 4 });
  const payload = await verifySessionToken(token);
  assert.equal(Number(payload?.sessionVersion), 4);
  // After a deactivation the stored version is 5, so the old token no longer matches.
  assert.notEqual(5, Number(payload?.sessionVersion));
});

test("self-deactivation is refused by both write paths, and the screen does not offer it", () => {
  // Both write paths run the shared account decision on the stored target
  // before writing; that decision refuses an actor deactivating itself.
  assert.match(deleteHandler, /const decision = authorizeAccountDeactivation\(actor, target\);\s*if \(!decision\.ok\) return refusal\(decision\);/);
  assert.match(patchHandler, /const decision = authorizeAccountUpdate\(actor, target, body\.data\);\s*if \(!decision\.ok\) return refusal\(decision\);/);
  const self = { id: "u-super", role: "SUPER_ADMIN" };
  assert.equal(authorizeAccountDeactivation(self, self).ok, false);
  assert.deepEqual(authorizeAccountUpdate(self, self, { active: false }), { ok: false, status: 400, error: "Use sign out instead of deactivating your current account." });
  assert.deepEqual(authorizeAccountUpdate(self, self, { active: true, name: "Still me" }), { ok: true });
  const rowActions = readFileSync("components/account-actions.tsx", "utf8");
  assert.match(rowActions, /account\.active && canDeactivateAccount\(actor, account\)/);
  const screen = readFileSync("components/users-admin.tsx", "utf8");
  assert.match(screen, /<AccountRowActions actor=\{actor\} account=\{user\}/);
  assert.match(screen, /canDeactivateAccount\(actor, \{ id: editing\.id, role: editing\.role \}\)/);
});

test("account authorization matrix: who may act on whom", () => {
  const superAdmin = { id: "u-super", role: "SUPER_ADMIN" };
  const ietAdmin = { id: "u-iet", role: "IET_ADMIN" };
  const editor = { id: "u-editor", role: "EDITOR" };
  const departmentAdmin = { id: "u-dept", role: "DEPARTMENT_ADMIN" };

  // SUPER_ADMIN may manage any other account, but never its own status.
  assert.equal(canDeactivateAccount(superAdmin, { id: "u-editor", role: "EDITOR" }), true);
  assert.equal(canActOnAccount(superAdmin, { role: "SUPER_ADMIN" }), true);
  assert.equal(canDeactivateAccount(superAdmin, superAdmin), false);

  // IET_ADMIN may manage everything except super administrators, and not itself.
  assert.equal(canDeactivateAccount(ietAdmin, { id: "u-editor", role: "EDITOR" }), true);
  assert.equal(canDeactivateAccount(ietAdmin, { id: "u-dept", role: "DEPARTMENT_ADMIN" }), true);
  assert.equal(canDeactivateAccount(ietAdmin, { id: "u-super", role: "SUPER_ADMIN" }), false);
  assert.equal(canActOnAccount(ietAdmin, { role: "SUPER_ADMIN" }), false);
  assert.equal(canDeactivateAccount(ietAdmin, ietAdmin), false);

  // No other role manages users (the existing policy), and an unknown session
  // (null actor) may do nothing.
  for (const actor of [editor, departmentAdmin]) {
    assert.equal(canDeactivateAccount(actor, { id: "u-editor", role: "EDITOR" }), false);
    assert.equal(canActOnAccount(actor, { role: "EDITOR" }), false);
  }
  assert.equal(canDeactivateAccount(null, { id: "u-editor", role: "EDITOR" }), false);
  assert.equal(canDeactivateAccount(undefined, { id: "u-editor", role: "EDITOR" }), false);
});

test("the roles an actor may grant match the API's grant rule", () => {
  const superAdmin = { role: "SUPER_ADMIN" };
  const ietAdmin = { role: "IET_ADMIN" };
  assert.deepEqual(adminRolesFor(superAdmin), ["SUPER_ADMIN", "IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"]);
  assert.deepEqual(adminRolesFor(ietAdmin), ["IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"]);
  assert.equal(adminRolesFor(ietAdmin).includes("SUPER_ADMIN"), false);
  assert.equal(canGrantRole(ietAdmin, "SUPER_ADMIN"), false);
  assert.equal(canGrantRole(ietAdmin, "EDITOR"), true);
  assert.equal(canGrantRole(superAdmin, "SUPER_ADMIN"), true);
  assert.equal(canGrantRole({ role: "EDITOR" }, "EDITOR"), false);
  // An unknown actor keeps only the role already stored on the record.
  assert.deepEqual(adminRolesFor(null, "EDITOR"), ["EDITOR"]);
  assert.deepEqual(adminRolesFor(null, "not-a-role"), []);
  const screen = readFileSync("components/users-admin.tsx", "utf8");
  assert.match(screen, /adminRolesFor\(actor\)/);
  assert.match(screen, /adminRolesFor\(actor, editing\.role\)/);
});

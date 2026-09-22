import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, passwordSchema } from "../lib/password-policy";

const route = readFileSync("app/api/auth/password/route.ts", "utf8");
const page = readFileSync("app/admin/(app)/account/page.tsx", "utf8");
const form = readFileSync("components/account-password-form.tsx", "utf8");
const shell = readFileSync("components/admin-shell.tsx", "utf8");

test("every signed-in role can change its own password without another administrator", () => {
  // The route authenticates the caller and never accepts a target account.
  assert.match(route, /const user = await getSession\(\)/);
  assert.match(route, /where: \{ id: user\.id \}/);
  assert.match(route, /data: \{ passwordHash, sessionVersion: \{ increment: 1 \} \}/);
  assert.doesNotMatch(route, /body\.(id|userId|email|target)\b/, "no target parameter exists, so another account's password cannot be set here");
  // No role gate: SUPER_ADMIN, IET_ADMIN, DEPARTMENT_ADMIN and EDITOR all pass.
  assert.doesNotMatch(route, /role !== "SUPER_ADMIN"|role === "EDITOR"|canManageUsers/, "self-service must not depend on administrative role");
  // The shared password policy is the only length rule.
  assert.match(route, /newPassword: passwordSchema/);
});

test("the password change keeps every existing protection", () => {
  // Same-origin, session requirement, rate limit, bcrypt, policy, audit.
  assert.match(route, /if \(!isSameOrigin\(request\)\) return NextResponse\.json\(\{ error: "Cross-origin request rejected\." \}, \{ status: 403 \}\)/);
  assert.match(route, /if \(!user\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  assert.match(route, /consumeRateLimit\(request, "auth:password-change", 10, 15 \* 60 \* 1000, user\.id\)/);
  assert.match(route, /if \(!limit\.allowed\) return NextResponse\.json\(\{ error: "Too many password change attempts\. Try again later\." \}, \{ status: 429/);
  assert.match(route, /bcrypt\.compare\(input\.currentPassword, account\.passwordHash\)/);
  assert.match(route, /bcrypt\.hash\(input\.newPassword, 12\)/);
  assert.match(route, /action: "PASSWORD_CHANGED_AND_INVALIDATED_SESSIONS"/);
  assert.match(route, /entity: "users"/);
  assert.match(route, /ipAddress: ipAddress\(request\)/);
  assert.match(route, /trustedClientIp\(request\)/);
  // Password update, session invalidation and audit are one transaction.
  assert.match(route, /prisma\.\$transaction\(async \(tx\) => \{/);
  assert.match(route, /await tx\.auditLog\.create\(/);
  // A wrong current password and a reused password are refused with clear,
  // non-revealing messages.
  assert.match(route, /if \(!currentMatches\) return NextResponse\.json\(\{ error: "Your current password is incorrect\." \}, \{ status: 400 \}\)/);
  assert.match(route, /if \(input\.currentPassword === input\.newPassword\)/);
  // The generic 500 path never leaks the underlying error.
  assert.match(route, /console\.error\("Password change failed", error\)/);
  assert.match(route, /NextResponse\.json\(\{ error: "Unable to change the password\." \}, \{ status: 500 \}\)/);
});

test("the current session is re-issued and every other session is invalidated", () => {
  assert.match(route, /await setSession\(\{ id: updated\.id, email: updated\.email, name: updated\.name, role: updated\.role, departmentId: updated\.departmentId \|\| undefined, sessionVersion: updated\.sessionVersion \}\)/);
  // The re-issue happens after the version increment, inside the same request.
  assert.ok(route.indexOf("sessionVersion: { increment: 1 }") < route.indexOf("await setSession("));
  // Sessions are validated against the stored version on every request.
  const auth = readFileSync("lib/auth.ts", "utf8");
  assert.match(auth, /if \(user\.sessionVersion !== tokenVersion\) return null;/);
});

test("the password form is reachable from the workspace for every role", () => {
  // The account page is a server component behind the existing authenticated layout.
  assert.match(page, /const user = await getSession\(\)/);
  assert.match(page, /if \(!user\) redirect\("\/admin\/login"\)/);
  // Its navigation entry is unconditional for a signed-in user (no policy gate).
  assert.match(shell, /\{user && <AdminLink href="\/admin\/account" label="Account & security"/);
  // The dashboard links to it as well.
  assert.match(readFileSync("app/admin/(app)/page.tsx", "utf8"), /<Link href="\/admin\/account" className="link-arrow">Change your password<\/Link>/);
  // The layout still protects the route.
  assert.match(readFileSync("app/admin/layout.tsx", "utf8"), /if \(!user\) redirect\("\/admin\/login"\)/);
});

test("the form validates locally but the server stays authoritative", () => {
  assert.match(form, /if \(newPassword !== confirmPassword\)/);
  assert.match(form, /if \(currentPassword === newPassword\)/);
  assert.match(form, /fetch\("\/api\/auth\/password", \{ method: "POST"/);
  // This route is never used to edit another account.
  assert.doesNotMatch(form, /userId|accountId|email:/);
  assert.match(form, /"Content-Type": "application\/json"/);
  // Requirements come from the shared policy module, not a hardcoded number.
  assert.match(page, /PASSWORD_REQUIREMENT/);
  assert.doesNotMatch(page, new RegExp(`at least ${MIN_PASSWORD_LENGTH + 4}`));
});

test("the shared policy still governs every password surface", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(MAX_PASSWORD_LENGTH, 200);
  assert.equal(passwordSchema.safeParse("short12").success, false);
  assert.equal(passwordSchema.safeParse("eight123").success, true);
  assert.equal(passwordSchema.safeParse("x".repeat(201)).success, false);
  assert.equal(passwordSchema.safeParse("").success, false);
  // Administrator-driven resets still exist and still invalidate sessions.
  const users = readFileSync("app/api/admin/users/route.ts", "utf8");
  assert.match(users, /password: passwordSchema\.optional\(\)/);
  assert.match(users, /const passwordHash = body\.data\.password \? await bcrypt\.hash\(body\.data\.password, 12\) : undefined;/);
  assert.match(users, /Boolean\(passwordHash \|\| scopeChanged \|\| body\.data\.active !== undefined\)/);
});

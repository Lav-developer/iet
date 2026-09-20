import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, meetsPasswordPolicy, passwordPolicyMessage, passwordSchema } from "../lib/password-policy";

function repositoryFiles() {
  // Tracked files only: never scan build output, node_modules or local stores.
  return execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.md"], { encoding: "utf8" }).trim().split("\n");
}

test("the institutional password minimum is 8 characters with the existing 200 character maximum", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(MAX_PASSWORD_LENGTH, 200);
  assert.equal(passwordPolicyMessage("SEED_ADMIN_PASSWORD"), "SEED_ADMIN_PASSWORD must be provided (8-200 characters).");
});

test("7 characters are rejected", () => {
  assert.equal(passwordSchema.safeParse("1234567").success, false);
  assert.equal(meetsPasswordPolicy("1234567"), false);
  assert.equal(passwordSchema.safeParse("").success, false);
});

test("8 characters are accepted", () => {
  assert.equal(passwordSchema.safeParse("12345678").success, true);
  assert.equal(meetsPasswordPolicy("12345678"), true);
  assert.equal(passwordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH + 1)).success, false);
  assert.equal(meetsPasswordPolicy("a".repeat(MAX_PASSWORD_LENGTH + 1)), false);
  assert.equal(meetsPasswordPolicy(undefined), false);
});

test("the seven/eight boundary is applied by the administrator API schema", () => {
  const route = readFileSync("app/api/admin/users/route.ts", "utf8");
  assert.match(route, /passwordSchema/, "the users API reads the shared policy");
  assert.doesNotMatch(route, /z\.string\(\)\.min\(12\)/);
  assert.match(route, /bcrypt\.hash\([^)]*, 12\)/, "bcrypt cost is unchanged");
});

test("every password length check uses the shared constant, with no hardcoded 12 anywhere", () => {
  const offenders: string[] = [];
  for (const file of repositoryFiles()) {
    const source = readFileSync(file, "utf8");
    if (/min\(12\)|length < 12|minLength=\{12\}|12 characters|at least 12/i.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `stale 12-character password policy in: ${offenders.join(", ")}`);

  for (const file of ["lib/config.ts", "app/api/admin/users/route.ts", "scripts/bootstrap-admin.ts", "prisma/seed.ts", "app/admin/(app)/users/page.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /password-policy/, `${file} imports the shared policy`);
  }
});

test("user-facing validation messages advertise the 8-character minimum", () => {
  const page = readFileSync("app/admin/(app)/users/page.tsx", "utf8");
  assert.match(page, /minLength=\{MIN_PASSWORD_LENGTH\}/);
  assert.match(page, /PASSWORD_REQUIREMENT/);
  assert.match(readFileSync("lib/password-policy.ts", "utf8"), /PASSWORD_REQUIREMENT = `At least \$\{MIN_PASSWORD_LENGTH\} characters\.`/);
});

test("authentication protections are unchanged: hashing, rate limiting, generic errors, session invalidation", () => {
  const login = readFileSync("app/api/auth/login/route.ts", "utf8");
  assert.match(login, /Invalid email or password\./);
  assert.match(login, /consumeRateLimit\(request, "auth:login", IP_LIMIT/);
  assert.match(login, /consumeRateLimit\(request, "auth:login-account", ACCOUNT_LIMIT/);
  assert.match(login, /const DELAY_CAP_SECONDS = 30/);
  const auth = readFileSync("lib/auth.ts", "utf8");
  assert.match(auth, /sessionVersion/);
  assert.match(auth, /bcrypt\.compare|compare\(/);
  assert.match(readFileSync("app/api/admin/users/route.ts", "utf8"), /bcrypt\.hash\(input\.password, 12\)/);
});

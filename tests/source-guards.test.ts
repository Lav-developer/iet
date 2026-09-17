import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Small source-level guards for properties that cannot be exercised
// behaviorally in this environment. Everything else is covered by the
// behavioral suites in this directory.

const source = (path: string) => readFileSync(path, "utf8");

test("no hardcoded demo credentials anywhere in auth code or seeds", () => {
  for (const path of ["lib/auth.ts", "prisma/seed.ts", "data/seed.ts"]) {
    assert.doesNotMatch(source(path), /Demo\d{4}|iet\.dsmnru\.ac\.in/, `${path} must not contain demo credentials`);
  }
});

test("production content paths fail closed instead of falling back to the local seed", () => {
  const store = source("lib/store.ts");
  assert.match(store, /if \(isProduction\)/);
  assert.match(store, /DATABASE_URL is required in production/);
  const config = source("lib/config.ts");
  assert.match(config, /DATABASE_URL/);
  assert.match(config, /AUTH_SECRET/);
});

test("security headers are configured for the production server", () => {
  const nextConfig = source("next.config.ts");
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /Strict-Transport-Security/);
  assert.match(nextConfig, /X-Content-Type-Options/);
});

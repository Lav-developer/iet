import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMagicBytes, validateUpload } from "../lib/storage";

const source = (path: string) => readFileSync(path, "utf8");

test("production content paths do not use the local seed fallback", () => {
  const store = source("lib/store.ts");
  const config = source("lib/config.ts");
  assert.match(store, /if \(isProduction\)/);
  assert.match(config, /DATABASE_URL/);
  assert.match(config, /AUTH_SECRET/);
  assert.doesNotMatch(source("lib/auth.ts"), /Demo\d{4}|iet\.dsmnru\.ac\.in/);
  assert.doesNotMatch(source("prisma/seed.ts"), /Demo\d{4}|iet\.dsmnru\.ac\.in/);
});

test("uploads require a matching magic signature", () => {
  assert.equal(validateMagicBytes(Buffer.from("%PDF-1.7\n"), "application/pdf"), true);
  assert.equal(validateMagicBytes(Buffer.from("not a pdf"), "application/pdf"), false);
  assert.equal(validateMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.throws(() => validateUpload("text/html", 20, "media"));
});

test("security headers and shared rate limiter are present", () => {
  assert.match(source("next.config.ts"), /Content-Security-Policy/);
  assert.match(source("next.config.ts"), /Strict-Transport-Security/);
  assert.match(source("lib/security.ts"), /RateLimitBucket/);
  assert.match(source("app/api/auth/login/route.ts"), /auth:login-account/);
});

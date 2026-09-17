import test from "node:test";
import assert from "node:assert/strict";

// Production origin semantics. isProduction is a module-level constant in
// lib/config.ts, so NODE_ENV must be set BEFORE the module is first imported.
(process.env as Record<string, string | undefined>).NODE_ENV = "production";

let isSameOrigin: (request: Request) => boolean;
test("production environment is active for this file", async () => {
  const security = await import("../lib/security");
  isSameOrigin = security.isSameOrigin;
  const config = await import("../lib/config");
  assert.equal(config.isProduction, true);
});

const req = (headers: Record<string, string>) =>
  new Request("http://app.test/x", { headers: { host: "app.test", ...headers } });

test("no Origin and no Referer is REJECTED in production (fail closed)", async () => {
  assert.equal(isSameOrigin(req({})), false);
});

test("matching Origin is still accepted in production", async () => {
  assert.equal(isSameOrigin(req({ origin: "http://app.test" })), true);
});

test("mismatched Origin is rejected", async () => {
  assert.equal(isSameOrigin(req({ origin: "https://evil.example" })), false);
});

test("matching Referer is accepted when Origin is absent (defense in depth keeps a path)", async () => {
  assert.equal(isSameOrigin(req({ referer: "http://app.test/login" })), true);
});

test("mismatched Referer is rejected", async () => {
  assert.equal(isSameOrigin(req({ referer: "https://evil.example/login" })), false);
});

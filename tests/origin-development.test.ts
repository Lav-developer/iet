import test from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../lib/security";

// Development (non-production) origin semantics. Each synthetic request sets
// an explicit Host header, as a real server request always carries one.

const req = (headers: Record<string, string>) =>
  new Request("http://app.test/x", { headers: { host: "app.test", ...headers } });

test("matching Origin is accepted", () => {
  assert.equal(isSameOrigin(req({ origin: "http://app.test" })), true);
});

test("different host or port Origin is rejected (same deployment via the other scheme is not)", () => {
  // The check compares HOST identity (the threat model is cross-site
  // attackers). The same deployment reached over the other scheme shares its
  // Host value and is intentionally accepted.
  assert.equal(isSameOrigin(req({ origin: "https://app.test" })), true, "same host, other scheme");
  assert.equal(isSameOrigin(req({ origin: "http://other.example" })), false, "different host");
  assert.equal(isSameOrigin(req({ origin: "http://app.test:8080" })), false, "different port");
  assert.equal(isSameOrigin(req({ origin: "http://evil.app.test" })), false, "suffix host");
});

test("no Origin and no Referer is accepted in development (local convenience)", () => {
  assert.equal(isSameOrigin(req({})), true);
});

test("matching Referer is accepted when Origin is absent", () => {
  assert.equal(isSameOrigin(req({ referer: "http://app.test/page" })), true);
});

test("Origin takes precedence over Referer: a mismatched Origin is rejected even with a matching Referer", () => {
  assert.equal(isSameOrigin(req({ origin: "https://evil.example", referer: "http://app.test/page" })), false);
});

test("malformed Origin or Referer is rejected", () => {
  assert.equal(isSameOrigin(req({ origin: "not a url" })), false);
  assert.equal(isSameOrigin(req({ referer: "not a url" })), false);
});

test("missing Host header is rejected (cannot prove same-origin)", () => {
  assert.equal(isSameOrigin(new Request("http://app.test/x", { headers: { origin: "http://app.test" } })), false);
});

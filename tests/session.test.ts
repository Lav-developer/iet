import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { issueSessionToken, verifySessionToken, sessionSecret } from "../lib/auth";

// Deterministic secret for this process. lib/auth reads AUTH_SECRET lazily in
// sessionSecret(), so static imports are fine.
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";

const USER = {
  id: "user-1",
  name: "Test User",
  email: "test-user@example.test",
  role: "IET_ADMIN" as const,
  sessionVersion: 3,
};

test("issue → verify round-trip preserves identity", async () => {
  const token = await issueSessionToken(USER);
  const payload = await verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload.email, USER.email);
  assert.equal(payload.sub, USER.id);
  assert.equal(payload.role, USER.role);
});

test("sessionSecret uses AUTH_SECRET when configured", () => {
  assert.equal(Buffer.from(sessionSecret()).toString("utf8"), process.env.AUTH_SECRET);
});

test("tampered token → rejected (null)", async () => {
  const token = await issueSessionToken(USER);
  const flipped = token.slice(0, -4) + (token.endsWith("aaaa") ? "bbbb" : "aaaa");
  assert.equal(await verifySessionToken(flipped), null);
});

test("token signed with a different key → rejected (null)", async () => {
  const foreign = await new SignJWT({ email: USER.email, sub: USER.id, role: USER.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode("another-secret-0123456789abcdef"));
  assert.equal(await verifySessionToken(foreign), null);
});

test("expired token → rejected (null)", async () => {
  const expired = await new SignJWT({ email: USER.email, sub: USER.id, role: USER.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Date.now() / 1000 - 3600)
    .setExpirationTime("-1h")
    .sign(sessionSecret());
  assert.equal(await verifySessionToken(expired), null);
});

test("tokens missing required claims → rejected (null)", async () => {
  const make = async (claims: Record<string, unknown>) =>
    new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(sessionSecret());

  assert.equal(await verifySessionToken(await make({ sub: USER.id, role: USER.role })), null, "missing email");
  assert.equal(await verifySessionToken(await make({ email: USER.email, role: USER.role })), null, "missing sub");
  assert.equal(await verifySessionToken(await make({ email: USER.email, sub: USER.id })), null, "missing role");
  assert.equal(await verifySessionToken(await make({})), null, "empty payload");
});

test("a token issued for a different user cannot be used for this one", async () => {
  const token = await issueSessionToken({ ...USER, id: "user-2", email: "attacker@example.test" });
  const payload = await verifySessionToken(token);
  assert.ok(payload);
  assert.notEqual(payload.email, USER.email);
});

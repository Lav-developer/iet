import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/auth/login/route";

// Behavioral tests execute the real route handler. Environment: no database
// (authenticate resolves to "no user" → 401), non-production NODE_ENV (local
// rate-limit store). The trusted proxy is simulated the way a real proxy
// behaves: the true client address is appended to the right of any forged
// XFF prefix, so each distinct real client address has its own IP bucket.

async function login(email: string, password: string, realClient: string, forgedPrefix?: string) {
  const xff = forgedPrefix ? `${forgedPrefix}, ${realClient}` : realClient;
  return POST(
    new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://app.test", host: "app.test", "x-forwarded-for": xff },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function setProxy(count: string | undefined) {
  if (count === undefined) delete process.env.TRUSTED_PROXY_COUNT;
  else process.env.TRUSTED_PROXY_COUNT = count;
}

test("valid-format credentials against an unknown account → 401 with the generic error", async () => {
  const previous = process.env.TRUSTED_PROXY_COUNT;
  setProxy("1");
  try {
    const res = await login("unknown-user-1@example.test", "correct-horse-battery-staple-42", "198.51.100.11");
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Invalid email or password." });
  } finally {
    setProxy(previous);
  }
});

test("no Origin and no Referer in development passes the origin gate (401, not 403)", async () => {
  // Development convenience: requests with no Origin/Referer at all (curl,
  // API clients, local tooling) are accepted by isSameOrigin in
  // non-production — verified behaviorally in origin-development.test.ts.
  // The production fail-closed case is pinned in origin-production.test.ts.
  const res = await POST(
    new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.test" },
      body: JSON.stringify({ email: "a@b.test", password: "x" }),
    }),
  );
  assert.equal(res.status, 401);
});

test("cross-origin Origin → 403", async () => {
  const res = await POST(
    new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", host: "app.test" },
      body: JSON.stringify({ email: "a@b.test", password: "x" }),
    }),
  );
  assert.equal(res.status, 403);
});

test("malformed payload → 400", async () => {
  const res = await POST(
    new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://app.test", host: "app.test" },
      body: JSON.stringify({ email: "not-an-email" }),
    }),
  );
  assert.equal(res.status, 400);
});

test("per-account bucket: attempts against one account are blocked across many different client addresses", async () => {
  const previous = process.env.TRUSTED_PROXY_COUNT;
  setProxy("1");
  try {
    // The progressive delay blocks from the 3rd attempt within the window;
    // the account bucket (10/15min) blocks from the 11th. Either way, once
    // the account is hammered, the block must follow the ACCOUNT.
    for (let i = 0; i < 11; i++) {
      const res = await login("target-account@example.test", `guess-${i}`, `203.0.113.${i + 10}`, `10.9.${i}.1`);
      if (i < 2) assert.equal(res.status, 401, `attempt ${i + 1}`);
      else assert.equal(res.status, 429, `attempt ${i + 1} blocked`);
    }
    // A brand-new client address (fresh IP bucket) still cannot reach the
    // account → the per-account bucket, not the IP bucket, is enforcing this.
    const freshClient = await login("target-account@example.test", "fresh-guess", "198.18.0.1");
    assert.equal(freshClient.status, 429);
    // …while a different account from the same fresh client still gets 401.
    const otherAccount = await login("unrelated-account@example.test", "fresh-guess", "198.18.0.1");
    assert.equal(otherAccount.status, 401);
  } finally {
    setProxy(previous);
  }
});

test("per-IP bucket: attempts from one client address are blocked across many different accounts", async () => {
  const previous = process.env.TRUSTED_PROXY_COUNT;
  setProxy("1");
  try {
    for (let i = 0; i < 11; i++) {
      const res = await login(`account-${i}-of-one-ip@example.test`, `password-${i}`, "198.51.100.99");
      if (i < 2) assert.equal(res.status, 401, `attempt ${i + 1}`);
      else assert.equal(res.status, 429, `attempt ${i + 1} blocked`);
    }
    // A new account from the same client address is still blocked → the IP
    // bucket is enforcing this, not the account bucket (each account got at
    // most one attempt).
    const newAccountSameIp = await login("brand-new-account-same-ip@example.test", "password", "198.51.100.99");
    assert.equal(newAccountSameIp.status, 429);
    // …while the same new account from a different client address gets 401.
    const newAccountNewIp = await login("brand-new-account-same-ip@example.test", "password", "198.18.0.2");
    assert.equal(newAccountNewIp.status, 401);
  } finally {
    setProxy(previous);
  }
});

test("progressive delay: the 3rd attempt within the window waits 5s (Retry-After)", async () => {
  const previous = process.env.TRUSTED_PROXY_COUNT;
  setProxy("1");
  try {
    const client = "198.51.100.55";
    const email = "delayed-account@example.test";
    const first = await login(email, "a", client);
    assert.equal(first.status, 401);
    const second = await login(email, "b", client);
    assert.equal(second.status, 401);
    const third = await login(email, "c", client);
    assert.equal(third.status, 429);
    assert.equal(third.headers.get("retry-after"), "5");
  } finally {
    setProxy(previous);
  }
});

test("no account enumeration: unknown accounts produce identical status and body", async () => {
  const previous = process.env.TRUSTED_PROXY_COUNT;
  setProxy("1");
  try {
    const unknown = await login("definitely-not-a-user-91827@example.test", "whatever-password-123", "198.51.100.77");
    const unknown2 = await login("another-definitely-not-a-user-13579@example.test", "whatever-password-123", "198.51.100.78");
    assert.equal(unknown.status, 401);
    assert.equal(unknown2.status, 401);
    assert.deepEqual(await unknown.json(), await unknown2.json());
  } finally {
    setProxy(previous);
  }
});

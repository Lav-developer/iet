import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_CLIENT_KEY, trustedClientIp } from "../lib/security";

const req = (headers: Record<string, string> = {}) => new Request("http://app.test/x", { headers });
const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("no trusted proxy configured: forwarded headers are never trusted", () => {
  withEnv({ TRUSTED_PROXY_COUNT: undefined, TRUSTED_PROXY_CIDRS: undefined }, () => {
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "1.2.3.4" })), DIRECT_CLIENT_KEY);
    assert.equal(trustedClientIp(req({ "x-real-ip": "1.2.3.4" })), DIRECT_CLIENT_KEY);
    assert.equal(trustedClientIp(req({})), DIRECT_CLIENT_KEY);
  });
});

test("one trusted proxy: client is the proxy-appended entry; rotating forged prefixes never changes it", () => {
  withEnv({ TRUSTED_PROXY_COUNT: "1", TRUSTED_PROXY_CIDRS: "10.0.0.5/32" }, () => {
    // Legitimate: proxy appends the true client; nothing forged.
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
    // Attacker forges left-hand entries; the proxy still appends the true
    // client (203.0.113.7) to the right, so the derived identity is stable.
    const a = trustedClientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));
    const b = trustedClientIp(req({ "x-forwarded-for": "2.2.2.2, 203.0.113.7" }));
    const c = trustedClientIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4, 203.0.113.7" }));
    assert.equal(a, "203.0.113.7");
    assert.equal(b, "203.0.113.7");
    assert.equal(c, "203.0.113.7");
  });
});

test("direct connection with forged headers while a proxy is configured: pooled into the shared bucket", () => {
  withEnv({ TRUSTED_PROXY_COUNT: "1", TRUSTED_PROXY_CIDRS: "10.0.0.5/32" }, () => {
    // No XFF at all (client connected directly to the app).
    assert.equal(trustedClientIp(req({})), DIRECT_CLIENT_KEY);
    // Forged header claiming to be our own proxy (short chain).
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "10.0.0.5" })), DIRECT_CLIENT_KEY);
    // Malformed entry where the client slot should be.
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "not-an-ip, 10.0.0.5" })), DIRECT_CLIENT_KEY);
  });
});

test("two trusted proxies: client sits at length-count; trusted region must match CIDRs", () => {
  withEnv({ TRUSTED_PROXY_COUNT: "2", TRUSTED_PROXY_CIDRS: "192.168.1.0/24" }, () => {
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "203.0.113.7, 192.168.1.9" })), "203.0.113.7");
    // Forged prefix still lands left of the two trusted-appended hops.
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 192.168.1.9" })), "203.0.113.7");
    // Trusted region contains an IP outside the configured CIDRs: reject.
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "203.0.113.7, 8.8.8.8" })), DIRECT_CLIENT_KEY);
    // Chain shorter than the trusted proxy count: reject.
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "203.0.113.7" })), DIRECT_CLIENT_KEY);
  });
});

test("IPv6 clients and mixed chains", () => {
  withEnv({ TRUSTED_PROXY_COUNT: "1", TRUSTED_PROXY_CIDRS: "192.168.0.0/16" }, () => {
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "2001:db8::7" })), "2001:db8::7");
    assert.equal(trustedClientIp(req({ "x-forwarded-for": "10.9.8.7, 2001:db8::7" })), "2001:db8::7");
  });
});

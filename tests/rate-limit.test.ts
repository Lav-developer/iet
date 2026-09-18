import test from "node:test";
import assert from "node:assert/strict";
import { consumeRateLimit, DIRECT_CLIENT_KEY } from "../lib/security";

const req = (headers: Record<string, string> = {}) => new Request("http://app.test/x", { headers });

test("local fallback: limit is enforced per identity", async () => {
  const scope = "test:basic";
  for (let i = 0; i < 5; i++) {
    const result = await consumeRateLimit(req(), scope, 5, 60_000, `identity-${i}`);
    assert.equal(result.allowed, true, `attempt ${i + 1} allowed`);
  }
  // The shared (header-less) bucket: 5 allowed, 6th denied.
  const shared: boolean[] = [];
  for (let i = 0; i < 6; i++) shared.push((await consumeRateLimit(req(), "test:shared", 5, 60_000)).allowed);
  assert.deepEqual(shared, [true, true, true, true, true, false]);
});

test("behind a trusted proxy, rotating forged XFF prefixes does NOT bypass the limit", async () => {
  const previousCount = process.env.TRUSTED_PROXY_COUNT;
  const previousCidrs = process.env.TRUSTED_PROXY_CIDRS;
  process.env.TRUSTED_PROXY_COUNT = "1";
  process.env.TRUSTED_PROXY_CIDRS = "10.0.0.5/32";
  try {
    const scope = "test:xff-rotation";
    // One real client (203.0.113.7, appended by the proxy) rotating forged
    // left-hand entries on every request.
    const results: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      const forged = `10.9.${i}.1`;
      const result = await consumeRateLimit(req({ "x-forwarded-for": `${forged}, 203.0.113.7` }), scope, 10, 60_000);
      results.push(result.allowed);
    }
    // Exactly the first 10 allowed; the attacker's forged rotation gained no
    // additional buckets.
    assert.deepEqual(results, [true, true, true, true, true, true, true, true, true, true, false, false, false, false, false]);
  } finally {
    if (previousCount === undefined) delete process.env.TRUSTED_PROXY_COUNT;
    else process.env.TRUSTED_PROXY_COUNT = previousCount;
    if (previousCidrs === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
    else process.env.TRUSTED_PROXY_CIDRS = previousCidrs;
  }
});

test("without a trusted proxy, forged XFF rotation also cannot bypass (single shared bucket)", async () => {
  const previousCount = process.env.TRUSTED_PROXY_COUNT;
  if (previousCount !== undefined) delete process.env.TRUSTED_PROXY_COUNT;
  try {
    const scope = "test:no-proxy-rotation";
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const result = await consumeRateLimit(req({ "x-forwarded-for": `10.9.${i}.1` }), scope, 5, 60_000);
      results.push(result.allowed);
    }
    assert.deepEqual(results, [true, true, true, true, true, false]);
  } finally {
    if (previousCount !== undefined) process.env.TRUSTED_PROXY_COUNT = previousCount;
  }
});

test("rate-limit result reports the bucket count for progressive delays", async () => {
  const result1 = await consumeRateLimit(req(), "test:count", 10, 60_000, "counter");
  const result2 = await consumeRateLimit(req(), "test:count", 10, 60_000, "counter");
  const result3 = await consumeRateLimit(req(), "test:count", 10, 60_000, "counter");
  assert.equal(result1.count, 1);
  assert.equal(result2.count, 2);
  assert.equal(result3.count, 3);
  assert.ok(result3.retryAfterSeconds >= 1);
});

test("direct key is a stable shared identity", () => {
  assert.equal(DIRECT_CLIENT_KEY, "direct");
});

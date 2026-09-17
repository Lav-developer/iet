import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/auth/logout/route";

// The logout route's same-origin gate is verifiable headlessly. The cookie
// deletion itself (clearSession → next/headers) requires Next's request scope
// and is exercised in the Phase 6 server smoke test (login → logout → verify
// the session cookie is removed and subsequent admin calls are 401).

test("cross-origin logout is rejected with 403", async () => {
  const res = await POST(
    new Request("http://app.test/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "app.test" },
    }),
  );
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Cross-origin request rejected." });
});

test("same-origin logout passes the origin gate (cookie deletion verified in server smoke)", async () => {
  // Headlessly, clearSession's cookies() call rejects (no Next request
  // scope) — but that rejection happens only AFTER the origin gate passed.
  // In the real server (smoke test) the same request returns 200 and clears
  // the cookie. The point pinned here: the gate does not block same-origin
  // callers, unlike the 403 cross-origin case above.
  await assert.rejects(
    POST(
      new Request("http://app.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://app.test", host: "app.test" },
      }),
    ),
  );
});

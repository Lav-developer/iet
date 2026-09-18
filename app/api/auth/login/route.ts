import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, setSession } from "@/lib/auth";
import { clearRateLimit, consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });

// Brute-force protection (all identities derived from the trusted proxy
// chain — see lib/security.ts trustedClientIp — never from raw headers):
// - 10 attempts per 15 minutes per client address
// - 10 attempts per 15 minutes per account email
// - progressive delay: from the 3rd attempt within the window, each request
//   must wait (count - 2) * 5 seconds (max 30 s) before credentials are
//   checked. Failed and successful attempts share the window; a successful
//   sign-in resets both buckets.
const IP_LIMIT = 10;
const ACCOUNT_LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;
const DELAY_AFTER_ATTEMPT = 2;
const DELAY_STEP_SECONDS = 5;
const DELAY_CAP_SECONDS = 30;

export async function POST(request: Request) {
  const key = trustedClientIp(request);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();
    const attempt = await consumeRateLimit(request, "auth:login", IP_LIMIT, WINDOW_MS);
    const accountAttempt = await consumeRateLimit(request, "auth:login-account", ACCOUNT_LIMIT, WINDOW_MS, email);
    if (!attempt.allowed || !accountAttempt.allowed) {
      const retryAfter = Math.max(attempt.retryAfterSeconds, accountAttempt.retryAfterSeconds);
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    const count = Math.max(attempt.count, accountAttempt.count);
    const delaySeconds = Math.min(DELAY_CAP_SECONDS, Math.max(0, count - DELAY_AFTER_ATTEMPT) * DELAY_STEP_SECONDS);
    if (delaySeconds > 0) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(delaySeconds) } });
    }
    const user = await authenticate(input.email, input.password);
    if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    await clearRateLimit("auth:login", key);
    await clearRateLimit("auth:login-account", email);
    await setSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}

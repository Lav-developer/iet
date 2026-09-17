import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, setSession } from "@/lib/auth";
import { clearRateLimit, clientKey, consumeRateLimit, isSameOrigin } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const key = clientKey(request);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const input = schema.parse(await request.json());
    const attempt = await consumeRateLimit(request, "auth:login", 10, 15 * 60 * 1000);
    const accountAttempt = await consumeRateLimit(request, "auth:login-account", 20, 15 * 60 * 1000, input.email.toLowerCase());
    if (!attempt.allowed || !accountAttempt.allowed) {
      const retryAfter = Math.max(attempt.retryAfterSeconds, accountAttempt.retryAfterSeconds);
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    const user = await authenticate(input.email, input.password);
    if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    await clearRateLimit("auth:login", key);
    await clearRateLimit("auth:login-account", input.email.toLowerCase());
    await setSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession, setSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { passwordSchema } from "@/lib/password-policy";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";

/**
 * Self-service password change for every authenticated role.
 *
 * Any signed-in administrator — super administrator, IET administrator,
 * department administrator or editor — may rotate their own password here
 * without involving another administrator. The route changes only the
 * authenticated account: there is no target parameter, so it cannot be used to
 * set somebody else's password (administrators still use the Users screen for
 * that).
 *
 * Protections preserved: the shared password policy (lib/password-policy),
 * bcrypt hashing, the session-version invalidation model (every other session
 * of this account dies, the current one is re-issued), rate limiting, same
 * origin enforcement and audit logging. Failures never reveal whether the
 * account exists.
 */
const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

function ipAddress(request: Request) {
  // Derived from the trusted proxy chain (see lib/security.ts), never from
  // raw client headers, so audit attribution cannot be spoofed.
  return trustedClientIp(request);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // A dedicated bucket stops password guessing through this endpoint, the
    // same way the sign-in route protects credential checking.
    const limit = await consumeRateLimit(request, "auth:password-change", 10, 15 * 60 * 1000, user.id);
    if (!limit.allowed) return NextResponse.json({ error: "Too many password change attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

    const input = schema.parse(await request.json());
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "Password changes require the database-backed deployment." }, { status: 503 });
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, passwordHash: true, sessionVersion: true, active: true } });
    if (!account || !account.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentMatches = await bcrypt.compare(input.currentPassword, account.passwordHash);
    if (!currentMatches) return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
    if (input.currentPassword === input.newPassword) return NextResponse.json({ error: "Choose a password you have not used here before." }, { status: 400 });

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    // Password change, session invalidation and the audit entry are atomic.
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({ where: { id: account.id }, data: { passwordHash, sessionVersion: { increment: 1 } }, select: { id: true, email: true, name: true, role: true, departmentId: true, sessionVersion: true } });
      await tx.auditLog.create({ data: { userId: user.id, role: user.role, action: "PASSWORD_CHANGED_AND_INVALIDATED_SESSIONS", entity: "users", entityId: saved.id, ipAddress: ipAddress(request), afterJson: JSON.stringify({ email: saved.email, self: true }) } });
      return saved;
    });

    // Every token issued before this change carries the old sessionVersion and
    // is now rejected; the current browsing session is re-issued so the
    // administrator is not signed out of the tab they are working in.
    await setSession({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, departmentId: updated.departmentId || undefined, sessionVersion: updated.sessionVersion });
    return NextResponse.json({ ok: true, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, sessionVersion: updated.sessionVersion } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Enter your current password and a new password." }, { status: 400 });
    console.error("Password change failed", error);
    return NextResponse.json({ error: "Unable to change the password." }, { status: 500 });
  }
}

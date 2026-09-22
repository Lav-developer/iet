import { passwordSchema } from "@/lib/password-policy";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";
import { authorizeAccountCreation, authorizeAccountDeactivation, authorizeAccountUpdate, resolveDepartmentAssignment } from "@/lib/user-roles";

const roleSchema = z.enum(["SUPER_ADMIN", "IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"]);
const departmentIdSchema = z.string().trim().max(200).nullable().optional();
const createSchema = z.object({ email: z.string().email().max(254), name: z.string().trim().min(2).max(120), password: passwordSchema, role: roleSchema, departmentId: departmentIdSchema });
const updateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), password: passwordSchema.optional(), role: roleSchema.optional(), departmentId: departmentIdSchema, active: z.boolean().optional() });

function ipAddress(request: Request) {
  // Derived from the trusted proxy chain (see lib/security.ts), never from
  // raw client headers, so audit attribution cannot be spoofed.
  return trustedClientIp(request);
}

/**
 * Who may change which account is decided by lib/user-roles (shared with the
 * Users screen, so the form never offers what the API refuses). Every write
 * path below evaluates that decision on the *stored* target before it hashes
 * or writes anything; in particular an IET_ADMIN can change nothing — role,
 * password, name or status — on a SUPER_ADMIN account.
 */
function refusal(decision: { ok: false; status: number; error: string }) {
  return NextResponse.json({ error: decision.error }, { status: decision.status });
}

/**
 * Role-dependent department rule, shared by create and update. Existence is
 * checked against the database only when a department is actually assigned.
 */
async function departmentAssignment(role: string, departmentId: string | null | undefined, currentDepartmentId: string | null | undefined) {
  const prisma = getPrisma();
  return resolveDepartmentAssignment({ role, departmentId, currentDepartmentId }, async (id) =>
    Boolean(prisma && (await prisma.department.findUnique({ where: { id }, select: { id: true } }))));
}

const pageLimitSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "User administration requires PostgreSQL." }, { status: 503 });
    const { page, limit } = pageLimitSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({ orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit, select: { id: true, email: true, name: true, role: true, departmentId: true, active: true, sessionVersion: true, createdAt: true, updatedAt: true, department: { select: { slug: true, name: true } } } }),
    ]);
    return NextResponse.json({ users, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    return handleError(error, "Unable to load users.");
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const actor = await requireAdmin();
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const limit = await consumeRateLimit(request, "admin:users", 30, 10 * 60 * 1000, actor.id);
    if (!limit.allowed) return NextResponse.json({ error: "Too many user changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const input = createSchema.parse(await request.json());
    const decision = authorizeAccountCreation(actor, input.role);
    if (!decision.ok) return refusal(decision);
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "User administration requires PostgreSQL." }, { status: 503 });
    const assignment = await departmentAssignment(input.role, input.departmentId, undefined);
    if (!assignment.ok) return NextResponse.json({ error: assignment.error }, { status: 400 });
    const passwordHash = await bcrypt.hash(input.password, 12);
    // User creation + audit entry are atomic.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: input.email.toLowerCase(), name: input.name, passwordHash, role: input.role, departmentId: assignment.departmentId }, select: { id: true, email: true, name: true, role: true, departmentId: true, active: true, sessionVersion: true } });
      await tx.auditLog.create({ data: { userId: actor.id, role: actor.role, action: "CREATED", entity: "users", entityId: created.id, ipAddress: ipAddress(request), afterJson: JSON.stringify({ email: created.email, role: created.role }) } });
      return created;
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to create user.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const actor = await requireAdmin();
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const limit = await consumeRateLimit(request, "admin:users", 30, 10 * 60 * 1000, actor.id);
    if (!limit.allowed) return NextResponse.json({ error: "Too many user changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const body = z.object({ id: z.string().min(1), data: updateSchema }).parse(await request.json());
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "User administration requires PostgreSQL." }, { status: 503 });
    const target = await prisma.user.findUnique({ where: { id: body.id } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    // Authorization runs on the stored account before any hashing or writing.
    const decision = authorizeAccountUpdate(actor, target, body.data);
    if (!decision.ok) return refusal(decision);
    const resultingRole = body.data.role || target.role;
    const assignment = await departmentAssignment(resultingRole, body.data.departmentId, target.departmentId);
    if (!assignment.ok) return NextResponse.json({ error: assignment.error }, { status: 400 });
    const passwordHash = body.data.password ? await bcrypt.hash(body.data.password, 12) : undefined;
    // A changed department/role is a changed authorization scope, so the
    // account's sessions are invalidated; an unchanged scope is not.
    const scopeChanged = target.role !== resultingRole || target.departmentId !== assignment.departmentId;
    const mustInvalidate = Boolean(passwordHash || scopeChanged || body.data.active !== undefined);
    // User update + audit entry are atomic; sessionVersion invalidation
    // happens in the same write.
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: target.id }, data: { name: body.data.name, passwordHash, role: body.data.role, departmentId: assignment.departmentId, active: body.data.active, ...(mustInvalidate ? { sessionVersion: { increment: 1 } } : {}) }, select: { id: true, email: true, name: true, role: true, departmentId: true, active: true, sessionVersion: true } });
      await tx.auditLog.create({ data: { userId: actor.id, role: actor.role, action: mustInvalidate ? "UPDATED_AND_INVALIDATED_SESSIONS" : "UPDATED", entity: "users", entityId: updated.id, ipAddress: ipAddress(request), afterJson: JSON.stringify({ email: updated.email, role: updated.role, active: updated.active }) } });
      return updated;
    });
    return NextResponse.json({ user });
  } catch (error) {
    return handleError(error, "Unable to update user.");
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const actor = await requireAdmin();
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = z.object({ id: z.string().min(1) }).parse(await request.json());
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "User administration requires PostgreSQL." }, { status: 503 });
    const target = await prisma.user.findUnique({ where: { id: body.id } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const decision = authorizeAccountDeactivation(actor, target);
    if (!decision.ok) return refusal(decision);
    // Deactivation + session invalidation + audit entry are atomic.
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: target.id }, data: { active: false, sessionVersion: { increment: 1 } }, select: { id: true, email: true, name: true, role: true, active: true } });
      await tx.auditLog.create({ data: { userId: actor.id, role: actor.role, action: "DEACTIVATED_AND_INVALIDATED_SESSIONS", entity: "users", entityId: updated.id, ipAddress: ipAddress(request), afterJson: JSON.stringify({ email: updated.email }) } });
      return updated;
    });
    return NextResponse.json({ user });
  } catch (error) {
    return handleError(error, "Unable to deactivate user.");
  }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.error(fallback, error);
  return NextResponse.json({ error: process.env.NODE_ENV === "production" ? fallback : (error instanceof Error ? error.message : fallback) }, { status: 500 });
}

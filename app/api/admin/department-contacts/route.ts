import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { canConfigureDepartmentContacts, validateDepartmentContacts, type PolicyUser } from "@/lib/content-policy";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";
import { getDepartmentContactConfig, replaceDepartmentContacts } from "@/lib/store";

export const runtime = "nodejs";

const querySchema = z.object({ departmentId: z.string().trim().min(1).max(200).optional() });

const updateSchema = z.object({
  departmentId: z.string().trim().min(1).max(200),
  contacts: z.unknown(),
});

function requestIp(request: Request) {
  // Derived from the trusted proxy chain (see lib/security.ts), never from raw
  // client headers, so audit attribution cannot be spoofed.
  return trustedClientIp(request);
}

async function assignedDepartmentSlug(departmentId: string | null | undefined): Promise<string | undefined> {
  const id = departmentId ?? undefined;
  if (!id) return undefined;
  const prisma = getPrisma();
  if (!prisma) return undefined;
  const department = await prisma.department.findUnique({ where: { id }, select: { slug: true } });
  return department?.slug;
}

/**
 * Resolves the department this request is allowed to touch. A department
 * administrator never names a department: their own assigned department is
 * used, and any other department id is refused before a read or write happens.
 */
async function resolveTarget(actor: PolicyUser, requested: string | undefined) {
  const slug = await assignedDepartmentSlug(actor.departmentId);
  const isDepartmentAdmin = actor.role === "DEPARTMENT_ADMIN";
  const target = isDepartmentAdmin ? actor.departmentId : requested || actor.departmentId;
  if (!target) return { ok: false as const, status: 400, error: isDepartmentAdmin ? "Your account is not assigned to a department." : "A department is required." };
  if (isDepartmentAdmin && requested && requested !== actor.departmentId) {
    return { ok: false as const, status: 403, error: "You can only configure your own department's contacts." };
  }
  const store = await getDepartmentContactConfig(target);
  if (!store) return { ok: false as const, status: 404, error: "Department not found." };
  if (!canConfigureDepartmentContacts(actor, store.department.slug, slug)) {
    return { ok: false as const, status: 403, error: "Your role cannot configure this department's contacts." };
  }
  return { ok: true as const, store, departmentSlug: store.department.slug };
}

export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    const { departmentId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const target = await resolveTarget(actor, departmentId);
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    return NextResponse.json({ department: target.store.department, contacts: target.store.contacts, faculty: target.store.faculty });
  } catch (error) {
    return handleError(error, "Unable to load department contacts.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const actor = await requireAdmin();
    const limit = await consumeRateLimit(request, "admin:department-contacts", 60, 10 * 60 * 1000, actor.id);
    if (!limit.allowed) return NextResponse.json({ error: "Too many changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const body = updateSchema.parse(await request.json());
    const target = await resolveTarget(actor, body.departmentId);
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status });
    // Validated by the same shared policy used by the CMS form: only a faculty
    // slug that belongs to this department can be configured.
    const contacts = validateDepartmentContacts(body.contacts);
    const saved = await replaceDepartmentContacts(
      { departmentId: target.store.department.id, contacts },
      { id: actor.id, email: actor.email, role: actor.role, ipAddress: requestIp(request) },
    );
    return NextResponse.json({ department: saved.department, contacts: saved.contacts, faculty: saved.faculty });
  } catch (error) {
    return handleError(error, "Unable to save department contacts.");
  }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof Error && error.message.includes("INVALID_INPUT")) return NextResponse.json({ error: error.message.replace("INVALID_INPUT: ", "") }, { status: 400 });
  if (error instanceof Error && error.message === "Department not found") return NextResponse.json({ error: "Department not found." }, { status: 404 });
  console.error(fallback, error);
  return NextResponse.json({ error: process.env.NODE_ENV === "production" ? fallback : (error instanceof Error ? error.message : fallback) }, { status: 500 });
}

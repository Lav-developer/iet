import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";
import { canAccess, departmentScoped, entitySchema, sanitize, validatePayload, workflowTransitionAllowed } from "@/lib/content-policy";
import { deleteEntity, getEntity, getEntityLabel, getSingleEntityRecord, upsertEntity } from "@/lib/store";
import type { EntityName } from "@/lib/types";

async function getAssignedDepartmentSlug(departmentId: string) {
  const prisma = getPrisma();
  if (!prisma) return undefined;
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { slug: true } });
  return department?.slug;
}

function requestIp(request: Request) {
  // Derived from the trusted proxy chain (see lib/security.ts), never from
  // raw client headers, so audit attribution cannot be spoofed.
  return trustedClientIp(request);
}

async function limitMutation(request: Request, user: SessionUser) {
  const result = await consumeRateLimit(request, "admin:content", 120, 60 * 1000, user.id);
  return result.allowed ? null : NextResponse.json({ error: "Too many content changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}

const pageLimitSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const entity = entitySchema.parse(new URL(request.url).searchParams.get("entity"));
    const { page, limit } = pageLimitSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (user.role === "DEPARTMENT_ADMIN" && !departmentScoped.has(entity)) return NextResponse.json({ error: "Your role is scoped to department content." }, { status: 403 });
    let records = await getEntity(entity, true);
    if (user.role === "DEPARTMENT_ADMIN") {
      const departmentSlug = user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
      records = departmentSlug ? records.filter((record) => (record as { departmentSlug?: string }).departmentSlug === departmentSlug) : [];
    }
    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paged = records.slice((page - 1) * limit, page * limit);
    return NextResponse.json({ entity, label: getEntityLabel(entity), records: paged, total, page, limit, totalPages });
  } catch (error) {
    return handleError(error, "Unable to load content.");
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const user = await requireAdmin();
    const limited = await limitMutation(request, user);
    if (limited) return limited;
    const body = await request.json() as { entity?: string; data?: Record<string, unknown> };
    const entity = entitySchema.parse(body.entity);
    const data = sanitize(entity, body.data || {});
    validatePayload(entity, data);
    const assignedDepartmentSlug = user.role === "DEPARTMENT_ADMIN" && user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
    if (!canAccess(user, entity, "write", data, undefined, assignedDepartmentSlug) || !workflowTransitionAllowed(user, undefined, data.status) || !(await departmentRelationsAllowed(user, entity, data))) return NextResponse.json({ error: "Your role cannot create this record, use that workflow transition, or its relationships are outside the assigned department." }, { status: 403 });
    const record = await upsertEntity(entity, data, user.email, undefined, user.id, user.role, requestIp(request));
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to create record.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const user = await requireAdmin();
    const limited = await limitMutation(request, user);
    if (limited) return limited;
    const body = await request.json() as { entity?: string; id?: string; data?: Record<string, unknown> };
    const entity = entitySchema.parse(body.entity);
    if (!body.id) return NextResponse.json({ error: "Record id is required." }, { status: 400 });
    // Targeted single-record fetch — never the whole dataset.
    const current = (await getSingleEntityRecord(entity, body.id)) as Record<string, unknown> | undefined;
    if (!current) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    const data = sanitize(entity, body.data || {});
    validatePayload(entity, data);
    const assignedDepartmentSlug = user.role === "DEPARTMENT_ADMIN" && user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
    if (!canAccess(user, entity, "write", data, current, assignedDepartmentSlug) || !workflowTransitionAllowed(user, current, data.status) || !(await departmentRelationsAllowed(user, entity, data))) return NextResponse.json({ error: "Your role cannot update this record, use that workflow transition, or its relationships are outside the assigned department." }, { status: 403 });
    const record = await upsertEntity(entity, data, user.email, body.id, user.id, user.role, requestIp(request));
    return NextResponse.json({ record });
  } catch (error) {
    return handleError(error, "Unable to update record.");
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const user = await requireAdmin();
    const limited = await limitMutation(request, user);
    if (limited) return limited;
    const search = new URL(request.url).searchParams;
    const entity = entitySchema.parse(search.get("entity"));
    const id = search.get("id");
    if (!id) return NextResponse.json({ error: "Record id is required." }, { status: 400 });
    // Targeted single-record fetch — never the whole dataset.
    const current = (await getSingleEntityRecord(entity, id)) as Record<string, unknown> | undefined;
    if (!current) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    const assignedDepartmentSlug = user.role === "DEPARTMENT_ADMIN" && user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
    if (!canAccess(user, entity, "delete", undefined, current, assignedDepartmentSlug)) return NextResponse.json({ error: "Your role cannot delete records." }, { status: 403 });
    await deleteEntity(entity, id, user.email, user.id, user.role, requestIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "Unable to delete record.");
  }
}

async function departmentRelationsAllowed(user: SessionUser, entity: EntityName, payload: Record<string, unknown>) {
  if (user.role !== "DEPARTMENT_ADMIN") return true;
  const prisma = getPrisma();
  if (!prisma || !user.departmentId) return false;
  const values = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
  if (entity === "programs") {
    const ids = values(payload.laboratorySlugs);
    if (!ids.length) return true;
    const rows = await prisma.laboratory.findMany({ where: { departmentId: user.departmentId, OR: [{ slug: { in: ids } }, { id: { in: ids } }] }, select: { id: true } });
    return rows.length === ids.length;
  }
  if (entity === "faculty") {
    const ids = values(payload.laboratorySlugs);
    if (!ids.length) return true;
    const rows = await prisma.laboratory.findMany({ where: { departmentId: user.departmentId, OR: [{ slug: { in: ids } }, { id: { in: ids } }] }, select: { id: true } });
    return rows.length === ids.length;
  }
  if (entity === "projects") {
    const faculty = values(payload.facultySlugs);
    const labs = values(payload.laboratorySlugs);
    const facultyRows = faculty.length ? await prisma.facultyMember.findMany({ where: { departmentId: user.departmentId, OR: [{ slug: { in: faculty } }, { id: { in: faculty } }] }, select: { id: true } }) : [];
    const labRows = labs.length ? await prisma.laboratory.findMany({ where: { departmentId: user.departmentId, OR: [{ slug: { in: labs } }, { id: { in: labs } }] }, select: { id: true } }) : [];
    return facultyRows.length === faculty.length && labRows.length === labs.length;
  }
  if (entity === "publications") {
    const authors = values(payload.authorSlugs);
    if (!authors.length) return true;
    const rows = await prisma.facultyMember.findMany({ where: { departmentId: user.departmentId, OR: [{ slug: { in: authors } }, { id: { in: authors } }] }, select: { id: true } });
    return rows.length === authors.length;
  }
  return true;
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid entity or request payload." }, { status: 400 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof Error && error.message === "Record not found") return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof Error && error.message.startsWith("INVALID_INPUT:")) return NextResponse.json({ error: error.message.replace("INVALID_INPUT: ", "") }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: process.env.NODE_ENV === "production" ? fallback : (error instanceof Error ? error.message : fallback) }, { status: 500 });
}

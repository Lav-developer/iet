import { validateAssetRelations } from "@/lib/faculty-relations";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";
import { canAccess, canPublish, canUnpublish, departmentScoped, entitySchema, sanitize, validatePayload, workflowTransitionAllowed, type PublishScope } from "@/lib/content-policy";
import { deleteEntity, getEntity, getEntityLabel, getSingleEntityRecord, upsertEntity } from "@/lib/store";
import type { EntityName } from "@/lib/types";

async function getAssignedDepartmentSlug(departmentId: string | null | undefined) {
  if (!departmentId) return undefined;
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
    // A department administrator's list is filtered in the database query
    // itself (see `scopedDepartmentWhere`): another department's rows are never
    // loaded into this process, let alone sent to the browser.
    const records = await getEntity(entity, true, user.role === "DEPARTMENT_ADMIN" ? { departmentSlug: await getAssignedDepartmentSlug(user.departmentId) } : undefined);
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
    const assignedDepartmentSlug = user.role === "DEPARTMENT_ADMIN" && user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
    // Publishing authority is decided per record: entity + the department the
    // record will belong to, against the administrator's assigned department.
    const scope: PublishScope = { entity, departmentSlug: data.departmentSlug, assignedDepartmentSlug };
    // Three separate decisions, each with a plain-language explanation, so an
    // administrator learns what to change instead of guessing between causes.
    if (!canAccess(user, entity, "write", data, undefined, assignedDepartmentSlug)) return forbidden(accessDeniedMessage(user, entity, "create", data, undefined, assignedDepartmentSlug, scope));
    if (!workflowTransitionAllowed(user, undefined, data.status, scope)) return forbidden(workflowDeniedMessage(user, undefined, data.status, scope));
    if (!(await departmentRelationsAllowed(user, entity, data))) return forbidden(RELATIONS_OUTSIDE_DEPARTMENT);
    validatePayload(entity, data);
    await validateAssetRelations(user, entity, data, getSingleEntityRecord, assignedDepartmentSlug);
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
    const assignedDepartmentSlug = user.role === "DEPARTMENT_ADMIN" && user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
    // The record's department after the write (unchanged when the request omits it).
    const scope: PublishScope = { entity, departmentSlug: data.departmentSlug === undefined ? current.departmentSlug : data.departmentSlug, assignedDepartmentSlug };
    if (!canAccess(user, entity, "write", data, current, assignedDepartmentSlug)) return forbidden(accessDeniedMessage(user, entity, "update", data, current, assignedDepartmentSlug, scope));
    if (!workflowTransitionAllowed(user, current, data.status, scope)) return forbidden(workflowDeniedMessage(user, current, data.status, scope));
    if (!(await departmentRelationsAllowed(user, entity, data))) return forbidden(RELATIONS_OUTSIDE_DEPARTMENT);
    // Validate the record as it will exist after the update. Validating the
    // incoming fragment alone rejected every workflow-only status change on a
    // notice ("A text notice requires a notice body.") because the rest of the
    // record was not part of the request.
    validatePayload(entity, { ...current, ...data });
    await validateAssetRelations(user, entity, data, getSingleEntityRecord, assignedDepartmentSlug, current);
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
    if (!canAccess(user, entity, "delete", undefined, current, assignedDepartmentSlug)) return forbidden("Your role cannot delete records. Unpublish or archive the record instead, or ask an institute administrator.");
    await deleteEntity(entity, id, user.email, user.id, user.role, requestIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "Unable to delete record.");
  }
}

const RELATIONS_OUTSIDE_DEPARTMENT = "One or more linked records (people or laboratories) belong to another department. Link only records from your own department.";

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

const PUBLISH_DENIED = "Your role cannot publish this record. Save it as a draft or submit it for review, and ask an institute administrator to publish it.";
const UNPUBLISH_DENIED = "Your role cannot unpublish a published record. Save your changes instead, or ask an institute administrator to unpublish it.";
const ARCHIVE_DENIED = "Your role cannot archive records. Ask an institute administrator.";
const ARCHIVED_READ_ONLY = "This record is archived and cannot be changed. An institute administrator can restore it as a draft.";
const PUBLISHED_READ_ONLY = "This record is on the public website and your role cannot publish changes to it. Ask an institute administrator.";

/** Why `canAccess` refused a write, in words a non-technical administrator can act on. */
function accessDeniedMessage(user: SessionUser, entity: EntityName, verb: "create" | "update", data: Record<string, unknown>, current: Record<string, unknown> | undefined, assignedDepartmentSlug: string | undefined, scope: PublishScope) {
  const currentStatus = current ? String(current.status || "DRAFT") : undefined;
  if (user.role === "DEPARTMENT_ADMIN") {
    if (!departmentScoped.has(entity)) return "Your role is scoped to department content.";
    if (!user.departmentId || !assignedDepartmentSlug) return "Your account has no department assigned yet, so it cannot change content. Ask an institute administrator to assign your department.";
    const currentDepartment = current?.departmentSlug;
    const requestedDepartment = data.departmentSlug === undefined ? currentDepartment : data.departmentSlug;
    if (currentDepartment && currentDepartment !== assignedDepartmentSlug) return "This record belongs to another department. You can only change records of your own department.";
    if (requestedDepartment !== assignedDepartmentSlug) return verb === "create" ? "You can only create records for your own department." : "Records must stay in your own department; moving a record to another department is not permitted.";
  }
  const publisher = canPublish(user, scope);
  const curator = canUnpublish(user, scope);
  if (currentStatus === "ARCHIVED" && !curator) return ARCHIVED_READ_ONLY;
  if (data.status === "ARCHIVED" && !curator) return ARCHIVE_DENIED;
  if (data.status === "PUBLISHED" && !publisher) return PUBLISH_DENIED;
  if (currentStatus === "PUBLISHED" && data.status === undefined && !publisher) return PUBLISHED_READ_ONLY;
  if (currentStatus === "PUBLISHED" && data.status !== undefined && data.status !== "PUBLISHED" && !curator) return UNPUBLISH_DENIED;
  return verb === "create" ? "Your role cannot create this record." : "Your role cannot change this record.";
}

/** Why the workflow refused a status change. */
function workflowDeniedMessage(user: SessionUser, current: Record<string, unknown> | undefined, requested: unknown, scope: PublishScope) {
  const next = String(requested);
  const previous = current ? String(current.status || "DRAFT") : undefined;
  const publisher = canPublish(user, scope);
  const curator = canUnpublish(user, scope);
  if (!["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"].includes(next)) return "The requested status is not recognised.";
  if (next === "PUBLISHED" && !publisher) return PUBLISH_DENIED;
  if (!previous && next === "ARCHIVED") return "A new record cannot be created as archived. Save it as a draft or publish it.";
  if (next === "ARCHIVED" && !curator) return ARCHIVE_DENIED;
  if (next === "ARCHIVED" && previous !== "PUBLISHED") return "Only a published record can be archived. Unpublished records can simply stay as drafts.";
  if (previous === "ARCHIVED") return curator ? "An archived record must be restored as a draft before it is published again." : ARCHIVED_READ_ONLY;
  if (previous === "PUBLISHED" && !curator) return UNPUBLISH_DENIED;
  return "That change of status is not available for this record.";
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

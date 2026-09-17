import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { consumeRateLimit, isSameOrigin } from "@/lib/security";
import { getEntity, getEntityLabel, deleteEntity, slugify, upsertEntity } from "@/lib/store";
import type { EntityName } from "@/lib/types";

const entityValues = ["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "achievements", "events", "organizations", "pages", "links", "contacts", "settings", "media", "documents"] as const;
const entitySchema = z.enum(entityValues);
const statusValues = new Set(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);
const departmentScoped = new Set(["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "organizations", "documents"]);
const allowedFields: Record<string, Set<string>> = {
  departments: new Set(["name", "shortName", "slug", "overview", "established", "sourceNote", "status"]),
  programs: new Set(["title", "shortTitle", "slug", "level", "duration", "approvedSeats", "summary", "eligibility", "admissionNote", "sourceNote", "departmentSlug", "laboratorySlugs", "status"]),
  faculty: new Set(["name", "slug", "designation", "email", "phone", "qualification", "profile", "researchInterests", "researchAreaSlugs", "laboratorySlugs", "departmentSlug", "type", "status"]),
  laboratories: new Set(["name", "slug", "description", "equipment", "courses", "researchRelevance", "departmentSlug", "status"]),
  researchAreas: new Set(["name", "slug", "description", "sourceNote", "facultySlugs", "departmentSlugs", "status"]),
  projects: new Set(["title", "slug", "summary", "sponsor", "departmentSlug", "facultySlugs", "laboratorySlugs", "status"]),
  publications: new Set(["title", "slug", "venue", "year", "doi", "url", "abstract", "departmentSlug", "authorSlugs", "status"]),
  achievements: new Set(["title", "category", "description", "recipient", "year", "eventName", "departmentSlug", "status"]),
  events: new Set(["title", "slug", "summary", "startsAt", "endsAt", "location", "registrationUrl", "departmentSlug", "status"]),
  organizations: new Set(["name", "slug", "description", "contactUrl", "departmentSlug", "status"]),
  pages: new Set(["title", "slug", "excerpt", "body", "locale", "status"]),
  links: new Set(["label", "url", "description", "owner", "order", "status"]),
  contacts: new Set(["label", "name", "email", "phone", "address", "category", "status"]),
  settings: new Set(["key", "value", "description"]),
  media: new Set(["key", "url", "mimeType", "sizeBytes", "altText", "caption"]),
  documents: new Set(["title", "description", "key", "url", "mimeType", "sizeBytes", "altText", "departmentSlug", "status"]),
};

async function can(user: SessionUser, entity: EntityName, action: "read" | "write" | "delete", payload?: Record<string, unknown>, current?: Record<string, unknown>) {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return true;
  if (user.role === "EDITOR") return action !== "delete" && current?.status !== "PUBLISHED" && current?.status !== "ARCHIVED" && payload?.status !== "PUBLISHED" && payload?.status !== "ARCHIVED";
  if (user.role === "DEPARTMENT_ADMIN") {
    if (!departmentScoped.has(entity) || action === "delete" || !user.departmentId) return false;
    const departmentSlug = await getAssignedDepartmentSlug(user.departmentId);
    const currentDepartment = current?.departmentSlug;
    const requestedDepartment = payload?.departmentSlug === undefined ? currentDepartment : payload.departmentSlug;
    if (!departmentSlug || requestedDepartment !== departmentSlug || (currentDepartment && currentDepartment !== departmentSlug)) return false;
    if (payload?.status === "PUBLISHED" || payload?.status === "ARCHIVED" || current?.status === "PUBLISHED") return false;
    return true;
  }
  return false;
}

async function getAssignedDepartmentSlug(departmentId: string) {
  const prisma = getPrisma();
  if (!prisma) return undefined;
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { slug: true } });
  return department?.slug;
}

function workflowTransitionAllowed(user: SessionUser, current: Record<string, unknown> | undefined, requested: unknown) {
  if (requested === undefined) return true;
  const next = String(requested);
  const previous = current ? String(current.status || "DRAFT") : undefined;
  if (!statusValues.has(next)) return false;
  if (!previous) return next === "DRAFT";
  if (next === previous) return true;
  if (previous === "DRAFT" && next === "REVIEW") return true;
  if (previous === "REVIEW" && next === "PUBLISHED") return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN";
  if (previous === "PUBLISHED" && next === "ARCHIVED") return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN";
  if (previous === "ARCHIVED" && next === "DRAFT") return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN";
  return false;
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

async function findRecord(entity: EntityName, id: string) {
  return (await getEntity(entity, true)).find((record) => (record as { id?: string }).id === id) as Record<string, unknown> | undefined;
}

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}

async function limitMutation(request: Request, user: SessionUser) {
  const result = await consumeRateLimit(request, "admin:content", 120, 60 * 1000, user.id);
  return result.allowed ? null : NextResponse.json({ error: "Too many content changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const entity = entitySchema.parse(new URL(request.url).searchParams.get("entity"));
    if (user.role === "DEPARTMENT_ADMIN" && !departmentScoped.has(entity)) return NextResponse.json({ error: "Your role is scoped to department content." }, { status: 403 });
    let records = await getEntity(entity, true);
    if (user.role === "DEPARTMENT_ADMIN") {
      const departmentSlug = user.departmentId ? await getAssignedDepartmentSlug(user.departmentId) : undefined;
      records = departmentSlug ? records.filter((record) => (record as { departmentSlug?: string }).departmentSlug === departmentSlug) : [];
    }
    return NextResponse.json({ entity, label: getEntityLabel(entity), records });
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
    if (!(await can(user, entity, "write", data)) || !workflowTransitionAllowed(user, undefined, data.status) || !(await departmentRelationsAllowed(user, entity, data))) return NextResponse.json({ error: "Your role cannot create this record, use that workflow transition, or its relationships are outside the assigned department." }, { status: 403 });
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
    const current = await findRecord(entity, body.id);
    if (!current) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    const data = sanitize(entity, body.data || {});
    validatePayload(entity, data);
    if (!(await can(user, entity, "write", data, current)) || !workflowTransitionAllowed(user, current, data.status) || !(await departmentRelationsAllowed(user, entity, data))) return NextResponse.json({ error: "Your role cannot update this record, use that workflow transition, or its relationships are outside the assigned department." }, { status: 403 });
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
    const current = await findRecord(entity, id);
    if (!current) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    if (!(await can(user, entity, "delete", undefined, current))) return NextResponse.json({ error: "Your role cannot delete records." }, { status: 403 });
    await deleteEntity(entity, id, user.email, user.id, user.role, requestIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "Unable to delete record.");
  }
}

function sanitize(entity: EntityName, raw: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) if (allowedFields[entity].has(key)) data[key] = typeof value === "string" ? value.trim() : value;
  if (data.status && !statusValues.has(String(data.status))) data.status = "DRAFT";
  if (data.researchInterests && typeof data.researchInterests === "string") data.researchInterests = data.researchInterests.split(",").map((item) => item.trim()).filter(Boolean);
  for (const key of ["approvedSeats", "year", "order"]) if (data[key] !== undefined && data[key] !== "") data[key] = Number(data[key]);
  const slugSource = data.slug || data.title || data.name || data.key;
  if (["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "events", "organizations", "pages"].includes(entity) && slugSource) data.slug = slugify(String(slugSource));
  if (entity === "settings" && !data.key) throw new Error("Setting key is required.");
  return data;
}

function validatePayload(entity: EntityName, data: Record<string, unknown>) {
  if (Object.values(data).some((value) => typeof value === "string" && value.length > 100000)) throw new Error("INVALID_INPUT: A content field is too large.");
  for (const key of ["slug", "departmentSlug", "authorSlugs", "facultySlugs", "laboratorySlugs", "researchAreaSlugs", "departmentSlugs"]) {
    const value = data[key];
    if ((typeof value === "string" && value.length > 2000) || (Array.isArray(value) && value.length > 100)) throw new Error("INVALID_INPUT: Relationship or slug input is too large.");
  }
  for (const key of ["url", "registrationUrl", "contactUrl"]) {
    if (!data[key]) continue;
    const value = String(data[key]);
    if (key === "url" && ["media", "documents"].includes(entity) && value.startsWith("/api/media/")) continue;
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch { throw new Error(`INVALID_INPUT: ${key} must be an HTTP or HTTPS URL.`); }
  }
  if (data.email) {
    const email = String(data.email);
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) || email.length > 254) throw new Error("INVALID_INPUT: Enter a valid email address.");
  }
  if (["events"].includes(entity)) {
    for (const key of ["startsAt", "endsAt"]) if (data[key]) {
      const date = new Date(String(data[key]));
      if (Number.isNaN(date.getTime())) throw new Error(`INVALID_INPUT: ${key} must be a valid date.`);
    }
  }
  if (entity === "pages" && typeof data.body === "string" && data.body.length > 100000) throw new Error("INVALID_INPUT: Page body is too large.");
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid entity or request payload." }, { status: 400 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error instanceof Error && error.message === "Record not found") return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof Error && error.message.startsWith("INVALID_INPUT:")) return NextResponse.json({ error: error.message.replace("INVALID_INPUT: ", "") }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: process.env.NODE_ENV === "production" ? fallback : (error instanceof Error ? error.message : fallback) }, { status: 500 });
}

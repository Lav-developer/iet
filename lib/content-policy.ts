import { z } from "zod";
import type { UserRole } from "@/lib/auth";
import type { EntityName } from "@/lib/types";

export const entityValues = ["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "achievements", "events", "organizations", "pages", "links", "contacts", "settings", "media", "documents"] as const;
export const entitySchema = z.enum(entityValues);

/**
 * Pure entity-name guard shared across the server/client boundary. Server
 * components use it to validate dynamic route params; client components may
 * reuse it. It has no client-only dependencies, so importing it from either
 * side is safe (never import callable utilities from a "use client" module
 * into a Server Component).
 */
export function isEntityName(value: string): value is EntityName {
  return (entityValues as readonly string[]).includes(value);
}
export const statusValues = new Set(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);
export const departmentScoped = new Set(["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "organizations", "documents"]);

export type PolicyUser = { role: UserRole; departmentId?: string | null };
export type RecordSnapshot = Record<string, unknown> | undefined;

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

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const collectionKeyPattern = (collection: "media" | "documents") =>
  new RegExp(`^${collection}/\\d{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{1,5}$`);

/**
 * Object keys are created by the upload endpoint as
 * `<collection>/<year>/<uuid>.<ext>`. Requiring that exact shape (own
 * collection, UUID object name) guarantees a record can never reference an
 * object from the other collection or any caller-chosen path — a media
 * record can never shadow a document (and vice versa) for public delivery.
 */
export function isMediaCollectionKey(key: unknown): boolean {
  return typeof key === "string" && collectionKeyPattern("media").test(key);
}

export function isDocumentCollectionKey(key: unknown): boolean {
  return typeof key === "string" && collectionKeyPattern("documents").test(key);
}

/**
 * Role + workflow authorization decision. Pure function: the caller resolves
 * the DEPARTMENT_ADMIN's assigned department slug from the database and
 * passes it in, keeping this decision fully testable.
 */
export function canAccess(user: PolicyUser, entity: EntityName, action: "read" | "write" | "delete", payload?: Record<string, unknown>, current?: RecordSnapshot, assignedDepartmentSlug?: string): boolean {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return true;
  if (user.role === "EDITOR") return action !== "delete" && current?.status !== "PUBLISHED" && current?.status !== "ARCHIVED" && payload?.status !== "PUBLISHED" && payload?.status !== "ARCHIVED";
  if (user.role === "DEPARTMENT_ADMIN") {
    if (!departmentScoped.has(entity) || action === "delete" || !user.departmentId) return false;
    const currentDepartment = current?.departmentSlug;
    const requestedDepartment = payload?.departmentSlug === undefined ? currentDepartment : payload.departmentSlug;
    if (!assignedDepartmentSlug || requestedDepartment !== assignedDepartmentSlug || (currentDepartment && currentDepartment !== assignedDepartmentSlug)) return false;
    if (payload?.status === "PUBLISHED" || payload?.status === "ARCHIVED" || current?.status === "PUBLISHED") return false;
    return true;
  }
  return false;
}

/**
 * DRAFT → REVIEW → PUBLISHED → ARCHIVED workflow enforcement. Only
 * SUPER_ADMIN / IET_ADMIN may publish (REVIEW → PUBLISHED), archive
 * (PUBLISHED → ARCHIVED) or reopen (ARCHIVED → DRAFT). Every record must be
 * created as DRAFT.
 */
export function workflowTransitionAllowed(user: PolicyUser, current: RecordSnapshot, requested: unknown): boolean {
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

/**
 * Field allow-list sanitization + payload validation. Throws
 * `INVALID_INPUT: …` for rejectable payloads (the route maps that to 400).
 */
export function sanitize(entity: EntityName, raw: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) if (allowedFields[entity].has(key)) data[key] = typeof value === "string" ? value.trim() : value;
  if (data.status && !statusValues.has(String(data.status))) data.status = "DRAFT";
  if (data.researchInterests && typeof data.researchInterests === "string") data.researchInterests = data.researchInterests.split(",").map((item) => item.trim()).filter(Boolean);
  for (const key of ["approvedSeats", "year", "order"]) if (data[key] !== undefined && data[key] !== "") data[key] = Number(data[key]);
  const slugSource = data.slug || data.title || data.name || data.key;
  if (["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "events", "organizations", "pages"].includes(entity) && slugSource) data.slug = slugify(String(slugSource));
  if (entity === "settings" && !data.key) throw new Error("Setting key is required.");
  if (entity === "media") {
    // A media record may only reference objects in the media storage
    // collection (UUID object names), never arbitrary storage keys — this is
    // what prevents shadowing document objects for public delivery.
    if (data.key !== undefined && data.key !== "" && !isMediaCollectionKey(data.key)) {
      throw new Error("INVALID_INPUT: Media key must reference an object from the media storage collection.");
    }
    if (data.key && isMediaCollectionKey(data.key)) data.url = `/api/media/${String(data.key).split("/").map(encodeURIComponent).join("/")}`;
    if (data.mimeType !== undefined && !IMAGE_MIME_TYPES.has(String(data.mimeType))) {
      throw new Error("INVALID_INPUT: Media MIME type must be an approved image type.");
    }
  }
  if (entity === "documents") {
    // Symmetric protection: document records may only reference objects in
    // the documents collection, so they cannot shadow media objects either.
    if (data.key !== undefined && data.key !== "" && !isDocumentCollectionKey(data.key)) {
      throw new Error("INVALID_INPUT: Document key must reference an object from the documents storage collection.");
    }
    if (data.key && isDocumentCollectionKey(data.key)) data.url = `/api/media/${String(data.key).split("/").map(encodeURIComponent).join("/")}`;
    if (data.mimeType !== undefined && String(data.mimeType) !== "application/pdf") {
      throw new Error("INVALID_INPUT: Document MIME type must be application/pdf.");
    }
  }
  return data;
}

export function validatePayload(entity: EntityName, data: Record<string, unknown>) {
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new Error("INVALID_INPUT: Enter a valid email address.");
  }
  if (["events"].includes(entity)) {
    for (const key of ["startsAt", "endsAt"]) if (data[key]) {
      const date = new Date(String(data[key]));
      if (Number.isNaN(date.getTime())) throw new Error(`INVALID_INPUT: ${key} must be a valid date.`);
    }
  }
  if (entity === "pages" && typeof data.body === "string" && data.body.length > 100000) throw new Error("INVALID_INPUT: Page body is too large.");
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

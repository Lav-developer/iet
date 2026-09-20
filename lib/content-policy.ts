import { z } from "zod";
import type { UserRole } from "@/lib/auth";
import type { EntityName } from "@/lib/types";

export const entityValues = ["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "achievements", "events", "notices", "organizations", "pages", "links", "contacts", "settings", "media", "documents"] as const;
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
export const departmentScoped = new Set(["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "notices", "organizations", "documents"]);

export type PolicyUser = { role: UserRole; departmentId?: string | null };
export type RecordSnapshot = Record<string, unknown> | undefined;

const allowedFields: Record<string, Set<string>> = {
  departments: new Set(["name", "shortName", "slug", "overview", "established", "sourceNote", "socialLinks", "status"]),
  programs: new Set(["title", "shortTitle", "slug", "level", "duration", "approvedSeats", "summary", "eligibility", "admissionNote", "sourceNote", "departmentSlug", "laboratorySlugs", "status"]),
  faculty: new Set(["name", "slug", "designation", "profileImageId", "cvUrl", "cvDocumentId", "email", "phone", "qualification", "profile", "researchInterests", "researchAreaSlugs", "laboratorySlugs", "departmentSlug", "type", "status"]),
  laboratories: new Set(["name", "slug", "description", "equipment", "courses", "researchRelevance", "departmentSlug", "status"]),
  researchAreas: new Set(["name", "slug", "description", "sourceNote", "facultySlugs", "departmentSlugs", "status"]),
  projects: new Set(["title", "slug", "summary", "sponsor", "departmentSlug", "facultySlugs", "laboratorySlugs", "status"]),
  publications: new Set(["title", "slug", "venue", "year", "doi", "url", "abstract", "departmentSlug", "authorSlugs", "status"]),
  achievements: new Set(["title", "category", "description", "recipient", "year", "eventName", "departmentSlug", "status"]),
  events: new Set(["title", "slug", "summary", "startsAt", "endsAt", "location", "registrationUrl", "organizationId", "departmentSlug", "status"]),
  organizations: new Set(["name", "slug", "description", "contactUrl", "departmentSlug", "status"]),
  notices: new Set(["title", "slug", "summary", "body", "noticeType", "documentId", "noticeDate", "expiryDate", "category", "departmentSlug", "status"]),
  pages: new Set(["title", "slug", "excerpt", "body", "locale", "status"]),
  links: new Set(["label", "url", "description", "owner", "order", "status"]),
  contacts: new Set(["label", "name", "email", "phone", "address", "category", "status"]),
  settings: new Set(["key", "value", "description"]),
  media: new Set(["key", "url", "mimeType", "sizeBytes", "altText", "caption"]),
  documents: new Set(["title", "description", "key", "url", "mimeType", "sizeBytes", "altText", "departmentSlug", "status"]),
};

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const socialPlatformValues = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "X", "YOUTUBE", "WEBSITE", "OTHER"] as const;
export type SocialPlatformValue = (typeof socialPlatformValues)[number];
export const MAX_SOCIAL_LINKS = 8;
const MAX_SOCIAL_URL_LENGTH = 300;
const MAX_SOCIAL_LABEL_LENGTH = 80;

/**
 * Department social links are stored as structured values, never HTML.
 * Social platforms must be HTTPS (they only publish HTTPS endpoints anyway);
 * WEBSITE / OTHER additionally accept HTTP for older official sites. Credential
 * URLs, whitespace and control characters are always rejected.
 */
export function validateSocialLinks(value: unknown): { platform: SocialPlatformValue; url: string; label?: string; order: number }[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new Error("INVALID_INPUT: Social links must be a list.");
  if (value.length > MAX_SOCIAL_LINKS) throw new Error(`INVALID_INPUT: A department may have at most ${MAX_SOCIAL_LINKS} social links.`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error("INVALID_INPUT: Each social link needs a platform and URL.");
    const raw = entry as Record<string, unknown>;
    const platform = String(raw.platform || "").trim().toUpperCase();
    if (!(socialPlatformValues as readonly string[]).includes(platform)) throw new Error(`INVALID_INPUT: Unsupported social platform "${String(raw.platform || "")}".`);
    // Surrounding whitespace is trimmed before validation; internal whitespace
    // and control characters are rejected by the URL check below.
    const url = String(raw.url || "").trim();
    if (!url || url.length > MAX_SOCIAL_URL_LENGTH) throw new Error("INVALID_INPUT: Each social link needs a URL of at most 300 characters.");
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("INVALID_INPUT: Social links must be absolute URLs."); }
    const httpsOnly = platform !== "WEBSITE" && platform !== "OTHER";
    const allowedProtocol = httpsOnly ? parsed.protocol === "https:" : parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!allowedProtocol || parsed.username || parsed.password || /[\u0000-\u0020\u007f]/.test(url)) {
      throw new Error(httpsOnly
        ? "INVALID_INPUT: Social platform links must be secure HTTPS URLs without credentials."
        : "INVALID_INPUT: Official links must be HTTP or HTTPS URLs without credentials.");
    }
    const label = raw.label === undefined || raw.label === null ? undefined : String(raw.label).trim();
    if (label && label.length > MAX_SOCIAL_LABEL_LENGTH) throw new Error("INVALID_INPUT: A social link label is too long.");
    if (platform === "OTHER" && !label) throw new Error("INVALID_INPUT: Provide a short label for an 'Other official link'.");
    return { platform: platform as SocialPlatformValue, url, ...(label ? { label } : {}), order: index };
  });
}

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
  if (["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "events", "notices", "organizations", "pages"].includes(entity) && slugSource) data.slug = slugify(String(slugSource));
  if (entity === "settings" && !data.key) throw new Error("Setting key is required.");
  if (entity === "departments" && data.socialLinks !== undefined) {
    // Normalizing here (not only in validatePayload) guarantees an unknown key
    // submitted alongside a platform/URL pair can never reach storage.
    data.socialLinks = validateSocialLinks(data.socialLinks);
  }
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
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u0020\u007f]/.test(value)) throw new Error();
    } catch { throw new Error(`INVALID_INPUT: ${key} must be an HTTP or HTTPS URL.`); }
  }
  if (data.cvUrl) {
    try {
      const url = new URL(String(data.cvUrl));
      if (url.protocol !== "https:" || url.username || url.password || /[\u0000-\u0020\u007f]/.test(String(data.cvUrl))) throw new Error();
    } catch { throw new Error("INVALID_INPUT: CV URL must be a valid HTTPS URL without credentials."); }
  }
  for (const key of ["profileImageId", "cvDocumentId", "organizationId"]) {
    if (data[key] !== undefined && data[key] !== null && (typeof data[key] !== "string" || String(data[key]).length > 200)) throw new Error(`INVALID_INPUT: Invalid ${key}.`);
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
  if (entity === "notices") {
    const noticeType = data.noticeType === undefined ? "TEXT" : String(data.noticeType).toUpperCase();
    if (!["TEXT", "PDF"].includes(noticeType)) throw new Error("INVALID_INPUT: Notice type must be TEXT or PDF.");
    const body = typeof data.body === "string" ? data.body.trim() : "";
    const documentId = data.documentId === undefined || data.documentId === null ? "" : String(data.documentId).trim();
    if (noticeType === "PDF" && !documentId) throw new Error("INVALID_INPUT: A PDF notice requires an uploaded PDF document.");
    if (noticeType === "TEXT" && !body) throw new Error("INVALID_INPUT: A text notice requires a notice body.");
    if (!String(data.title || "").trim()) throw new Error("INVALID_INPUT: A notice title is required.");
    for (const key of ["noticeDate", "expiryDate"]) {
      if (data[key] === undefined || data[key] === null || data[key] === "") continue;
      if (Number.isNaN(new Date(String(data[key])).getTime())) throw new Error(`INVALID_INPUT: ${key} must be a valid date.`);
    }
    const noticeDate = data.noticeDate ? new Date(String(data.noticeDate)) : undefined;
    const expiryDate = data.expiryDate ? new Date(String(data.expiryDate)) : undefined;
    if (noticeDate && expiryDate && expiryDate.getTime() < noticeDate.getTime()) throw new Error("INVALID_INPUT: The expiry date cannot be before the notice date.");
  }
  if (entity === "departments" && data.socialLinks !== undefined) data.socialLinks = validateSocialLinks(data.socialLinks);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

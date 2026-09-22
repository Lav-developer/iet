import { z } from "zod";
import type { UserRole } from "@/lib/auth";
import type { ContentStatus, EntityName } from "@/lib/types";

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
  if (user.role === "EDITOR") {
    // Institution-wide editorial scope: every content entity, never delete.
    // Publication state follows the editor's publishing authority (see
    // `editorialWriteAllowed`), so nothing is offered that the workflow refuses.
    if (action === "delete") return false;
    return action === "read" || editorialWriteAllowed(user, { entity, departmentSlug: resultingDepartment(payload, current) }, payload, current);
  }
  if (user.role === "DEPARTMENT_ADMIN") {
    if (!departmentScoped.has(entity) || action === "delete" || !user.departmentId) return false;
    const currentDepartment = current?.departmentSlug;
    const requestedDepartment = resultingDepartment(payload, current);
    // Never cross-department: the record must belong to the assigned
    // department now and after the write.
    if (!assignedDepartmentSlug || requestedDepartment !== assignedDepartmentSlug || (currentDepartment && currentDepartment !== assignedDepartmentSlug)) return false;
    return action === "read" || editorialWriteAllowed(user, { entity, departmentSlug: requestedDepartment, assignedDepartmentSlug }, payload, current);
  }
  return false;
}

/** Department the record belongs to after the write: the payload's value, else the stored one. */
function resultingDepartment(payload?: Record<string, unknown>, current?: RecordSnapshot): unknown {
  return payload?.departmentSlug === undefined ? current?.departmentSlug : payload.departmentSlug;
}

/**
 * Write rule for the delegated roles (EDITOR, DEPARTMENT_ADMIN), derived from
 * the same publishing authority the workflow enforces:
 * - drafts and records in review may always be edited;
 * - PUBLISHED may be requested (publish, or keep a live record live while
 *   editing it) only with publishing authority for this record — a role that
 *   cannot publish a record cannot change what the public sees either;
 * - taking a live record offline, archiving, and touching archived records
 *   need unpublish/archive authority for this record.
 */
function editorialWriteAllowed(user: PolicyUser, scope: PublishScope, payload?: Record<string, unknown>, current?: RecordSnapshot): boolean {
  const currentStatus = current ? String(current.status || "DRAFT") : undefined;
  const requested = payload?.status === undefined || payload?.status === "" ? undefined : String(payload.status);
  const publisher = canPublish(user, scope);
  const curator = canUnpublish(user, scope);
  if (currentStatus === "ARCHIVED" || requested === "ARCHIVED") return curator;
  if (requested === "PUBLISHED") return publisher;
  if (currentStatus === "PUBLISHED") return requested === undefined ? publisher : curator;
  return true;
}

/**
 * The record a publishing decision is about. `departmentSlug` is the
 * department the record belongs to after the write (payload value, else the
 * stored one); `assignedDepartmentSlug` is the DEPARTMENT_ADMIN's own
 * department as resolved by the caller from the database.
 */
export type PublishScope = { entity: EntityName; departmentSlug?: unknown; assignedDepartmentSlug?: string };

/** Entities in the EDITOR's institution-wide editorial scope (everything it may write). */
const editorialScope: ReadonlySet<string> = new Set(entityValues);

/** DEPARTMENT_ADMIN publishing scope: department-scoped entity, record inside the assigned department. */
function withinAssignedDepartment(user: PolicyUser, scope: PublishScope): boolean {
  return Boolean(user.departmentId && scope.assignedDepartmentSlug && departmentScoped.has(scope.entity) && scope.departmentSlug === scope.assignedDepartmentSlug);
}

/**
 * Publishing authority for one record (DRAFT/REVIEW → PUBLISHED, creating a
 * record as PUBLISHED, and saving a PUBLISHED record so that it stays live):
 * - SUPER_ADMIN / IET_ADMIN: every record;
 * - DEPARTMENT_ADMIN: department-scoped entities, records of the assigned
 *   department only — never another department's;
 * - EDITOR: records within its editorial scope.
 * Without a record scope no delegated authority is assumed: only the two
 * institute-wide roles publish "in general".
 */
export function canPublish(user: PolicyUser, scope?: PublishScope): boolean {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return true;
  if (!scope) return false;
  if (user.role === "EDITOR") return editorialScope.has(scope.entity);
  if (user.role === "DEPARTMENT_ADMIN") return withinAssignedDepartment(user, scope);
  return false;
}

/**
 * Unpublish / archive / restore authority for one record: SUPER_ADMIN and
 * IET_ADMIN everywhere, DEPARTMENT_ADMIN inside the assigned department.
 * An EDITOR publishes but does not take content offline or archive it.
 */
export function canUnpublish(user: PolicyUser, scope?: PublishScope): boolean {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return true;
  if (!scope) return false;
  if (user.role === "DEPARTMENT_ADMIN") return withinAssignedDepartment(user, scope);
  return false;
}

/**
 * Workflow enforcement. Publication needs no separate approval step: a user
 * with publishing authority for the record publishes a draft directly —
 * DRAFT → PUBLISHED — and REVIEW is an optional stage that any writer may
 * enter (DRAFT → REVIEW) or leave again (REVIEW → DRAFT). Unpublishing
 * (PUBLISHED → DRAFT), archiving and restoring an archived record need
 * unpublish/archive authority. New records may be created as DRAFT or REVIEW
 * by any writer, and as PUBLISHED with publishing authority. Keeping a record
 * PUBLISHED (or ARCHIVED) while editing it needs the same authority as
 * reaching that state.
 */
export function workflowTransitionAllowed(user: PolicyUser, current: RecordSnapshot, requested: unknown, scope?: PublishScope): boolean {
  if (requested === undefined) return true;
  const next = String(requested);
  const previous = current ? String(current.status || "DRAFT") : undefined;
  if (!statusValues.has(next)) return false;
  const publisher = canPublish(user, scope);
  const curator = canUnpublish(user, scope);
  if (!previous) return next === "DRAFT" || next === "REVIEW" || (next === "PUBLISHED" && publisher);
  if (next === previous) return next === "PUBLISHED" ? publisher : next === "ARCHIVED" ? curator : true;
  if (previous === "DRAFT" && next === "REVIEW") return true;
  if (previous === "REVIEW" && next === "DRAFT") return true;
  if ((previous === "DRAFT" || previous === "REVIEW") && next === "PUBLISHED") return publisher;
  if (previous === "PUBLISHED" && (next === "DRAFT" || next === "ARCHIVED")) return curator;
  if (previous === "ARCHIVED" && next === "DRAFT") return curator;
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
    // An unset or empty select means "not provided" and defaults to TEXT, the
    // same way an absent key does.
    const noticeType = data.noticeType === undefined || data.noticeType === null || String(data.noticeType).trim() === "" ? "TEXT" : String(data.noticeType).toUpperCase();
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

/* ------------------------------------------------------------------ */
/* Department contact configuration                                    */
/* ------------------------------------------------------------------ */

/**
 * Editorial responsibilities a department can configure. The list is a
 * convenience for the CMS select, not a rule: any department may keep its own
 * free-text label, because no single responsibility is universal.
 */
export const departmentContactRoleValues = ["Coordinator", "Department In-Charge", "Head of Department", "Programme Coordinator"] as const;
export const MAX_DEPARTMENT_CONTACTS = 6;
const MAX_CONTACT_ROLE_LENGTH = 60;

/** A faculty slug as produced by `slugify` — used to reject anything else. */
const facultySlugPattern = /^[a-z0-9][a-z0-9-]{0,119}$/;

/**
 * Normalizes and validates a department's contact configuration. Accepts the
 * faculty **slug** (never a raw id typed by a human) plus the configured role
 * label, rejects duplicates, and returns entries with their display order.
 */
export function validateDepartmentContacts(value: unknown): { role: string; facultySlug: string; order: number }[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new Error("INVALID_INPUT: Department contacts must be a list.");
  if (value.length > MAX_DEPARTMENT_CONTACTS) throw new Error(`INVALID_INPUT: A department may configure at most ${MAX_DEPARTMENT_CONTACTS} contacts.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error("INVALID_INPUT: Each department contact needs a responsibility and a person.");
    const raw = entry as Record<string, unknown>;
    const role = String(raw.role ?? "").trim();
    if (!role || role.length > MAX_CONTACT_ROLE_LENGTH) throw new Error(`INVALID_INPUT: Each contact needs a responsibility of at most ${MAX_CONTACT_ROLE_LENGTH} characters.`);
    const facultySlug = String(raw.facultySlug ?? "").trim();
    // The CMS selector submits the faculty member's slug, never a hand-typed id.
    // Malformed values are rejected here; a well-formed slug that is not part
    // of the department is rejected by the membership check at write time.
    if (!facultySlugPattern.test(facultySlug)) throw new Error("INVALID_INPUT: Select a faculty member by name from the department list.");
    if (seen.has(facultySlug)) throw new Error("INVALID_INPUT: The same faculty member cannot hold two configured responsibilities.");
    seen.add(facultySlug);
    return { role, facultySlug, order: index };
  });
}

/**
 * Who may maintain a department's configured contacts:
 * - SUPER_ADMIN / IET_ADMIN: any department (their existing institute-wide authority).
 * - DEPARTMENT_ADMIN: only their own assigned department.
 * - EDITOR: not part of the existing editorial scope for department configuration.
 * The decision is pure, and the API repeats it server-side before any write.
 */
export function canConfigureDepartmentContacts(user: PolicyUser, targetDepartmentSlug: string, assignedDepartmentSlug?: string): boolean {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return true;
  if (user.role === "DEPARTMENT_ADMIN") return Boolean(user.departmentId && assignedDepartmentSlug && assignedDepartmentSlug === targetDepartmentSlug);
  return false;
}

/* ------------------------------------------------------------------ */
/* Role-aware CMS surface                                              */
/* ------------------------------------------------------------------ */

export type AdminSection = "dashboard" | "audit" | "users" | "departmentContacts";

/**
 * Role-aware CMS navigation/action visibility. This is the same policy the
 * server enforces (see `canAccess`): it only decides what the workspace shows,
 * and every route still authorizes each request independently. No role
 * definition is duplicated outside this module.
 */
export function visibleAdminSections(user: PolicyUser): AdminSection[] {
  if (user.role === "SUPER_ADMIN") return ["dashboard", "audit", "users", "departmentContacts"];
  if (user.role === "IET_ADMIN") return ["dashboard", "audit", "users", "departmentContacts"];
  if (user.role === "DEPARTMENT_ADMIN") return user.departmentId ? ["dashboard", "departmentContacts"] : ["dashboard"];
  return ["dashboard"];
}

export type EntityCapability = { entity: EntityName; canCreate: boolean; canDelete: boolean };

/**
 * Entities a role may work with in the CMS, plus the coarse actions the
 * workspace may offer. Record-level decisions (department, workflow status,
 * ownership) are still made by `canAccess`/`workflowTransitionAllowed` on every
 * request — a hidden control is never the protection.
 */
export function visibleEntities(user: PolicyUser): EntityCapability[] {
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") return entityValues.map((entity) => ({ entity, canCreate: true, canDelete: true }));
  if (user.role === "EDITOR") return entityValues.map((entity) => ({ entity, canCreate: true, canDelete: false }));
  if (user.role === "DEPARTMENT_ADMIN" && user.departmentId) {
    return entityValues.filter((entity) => departmentScoped.has(entity)).map((entity) => ({ entity, canCreate: true, canDelete: false }));
  }
  return [];
}

/** User administration is limited to the roles the users API accepts. */
export function canManageUsers(user: PolicyUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN";
}

/** Audit logs follow the same rule as /api/admin/audit. */
export function canViewAuditLogs(user: PolicyUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN";
}

/** Roles allowed to attach an institute-wide department on a notice. */
export function canPublishInstitutionWideNotice(user: PolicyUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN" || user.role === "EDITOR";
}

export type EntityCapabilityDetail = {
  canCreate: boolean;
  canDelete: boolean;
  /** Whether the role publishes records of this entity (within its scope) directly. */
  canPublish: boolean;
  /** Whether the role unpublishes, archives and restores records of this entity (within its scope). */
  canUnpublish: boolean;
  /** Statuses the CMS may offer when creating a record. */
  createStatusOptions: string[];
  /** Statuses the CMS may offer when editing an existing record. */
  editStatusOptions: string[];
  /** Set for DEPARTMENT_ADMIN: their content is always tied to this department. */
  fixedDepartmentSlug?: string;
};

/**
 * What the CMS may offer for one entity and one role. Derived from the same
 * policy that `canAccess`/`workflowTransitionAllowed` enforce server-side, so
 * the workspace can hide what the API would reject without inventing rules.
 * For a DEPARTMENT_ADMIN every record the workspace shows or creates belongs
 * to the assigned department (the list is filtered in the database and the
 * department field is fixed), so the entity-level answer is the record-level
 * answer.
 */
export function entityCapability(user: PolicyUser, entity: EntityName, assignedDepartmentSlug?: string): EntityCapabilityDetail {
  const everyStatus = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
  if (user.role === "SUPER_ADMIN" || user.role === "IET_ADMIN") {
    return { canCreate: true, canDelete: true, canPublish: true, canUnpublish: true, createStatusOptions: ["DRAFT", "REVIEW", "PUBLISHED"], editStatusOptions: everyStatus };
  }
  if (user.role === "EDITOR") {
    const publisher = canPublish(user, { entity });
    return { canCreate: true, canDelete: false, canPublish: publisher, canUnpublish: false, createStatusOptions: publisher ? ["DRAFT", "REVIEW", "PUBLISHED"] : ["DRAFT", "REVIEW"], editStatusOptions: publisher ? ["DRAFT", "REVIEW", "PUBLISHED"] : ["DRAFT", "REVIEW"] };
  }
  // A department administrator works only inside the assigned department, which
  // the server resolves from the account (never from the client). Without a
  // resolvable department the server refuses every write, so nothing is offered.
  if (user.role === "DEPARTMENT_ADMIN" && user.departmentId && departmentScoped.has(entity) && assignedDepartmentSlug) {
    const scope: PublishScope = { entity, departmentSlug: assignedDepartmentSlug, assignedDepartmentSlug };
    const publisher = canPublish(user, scope);
    return {
      canCreate: true,
      canDelete: false,
      canPublish: publisher,
      canUnpublish: canUnpublish(user, scope),
      createStatusOptions: publisher ? ["DRAFT", "REVIEW", "PUBLISHED"] : ["DRAFT", "REVIEW"],
      editStatusOptions: publisher ? everyStatus : ["DRAFT", "REVIEW"],
      fixedDepartmentSlug: assignedDepartmentSlug,
    };
  }
  return { canCreate: false, canDelete: false, canPublish: false, canUnpublish: false, createStatusOptions: ["DRAFT"], editStatusOptions: ["DRAFT"] };
}

/** One button the editor offers; `status` is what the request will carry. */
export type WorkflowAction = {
  status: ContentStatus;
  label: string;
  /** Primary = the default action for this state; secondary = alternative. */
  kind: "primary" | "secondary";
  /** Ask for confirmation before performing a change with public effect. */
  confirm?: string;
  /** Plain-language explanation shown next to the buttons. */
  description?: string;
};

/**
 * Simple workflow controls for non-technical staff, derived from the same
 * policy `workflowTransitionAllowed`/`canAccess` enforce on the server:
 *
 * - new record: Save as draft · Publish (publishing authority) · Submit for review
 * - draft: Save draft · Publish · Submit for review
 * - in review: Save changes · Publish · Return to draft
 * - published: Save changes (changes go live; publishing authority) ·
 *   Unpublish (unpublish authority); read-only otherwise
 * - archived: Restore as draft (unpublish authority); read-only otherwise
 *
 * Every action returned here is accepted by the server for the same role and
 * state, and nothing the server would accept is hidden (see
 * tests/workflow-actions.test.ts).
 */
export function workflowActions(capability: Pick<EntityCapabilityDetail, "canPublish" | "canUnpublish" | "canCreate">, currentStatus?: string | null): WorkflowAction[] {
  const status = currentStatus ? String(currentStatus) : undefined;
  // `canCreate` is false only for a role with no write authority on the entity
  // at all (see entityCapability); such a role gets no buttons for any state.
  if (!capability.canCreate) return [];
  const publisher = capability.canPublish;
  const curator = capability.canUnpublish;
  const publish: WorkflowAction = { status: "PUBLISHED", label: "Publish", kind: "primary", confirm: "Publish this record on the public website now?", description: "Publishing makes the record visible to the public immediately." };
  const review: WorkflowAction = { status: "REVIEW", label: "Submit for review", kind: "secondary", description: publisher ? "Optional: mark the record as ready for another administrator to check." : "Marks the record as ready for an institute administrator to publish." };
  if (!status) {
    return [
      { status: "DRAFT", label: "Save as draft", kind: publisher ? "secondary" : "primary", description: "Drafts are not shown on the public website." },
      ...(publisher ? [publish] : []),
      review,
    ];
  }
  if (status === "DRAFT") {
    return [
      { status: "DRAFT", label: "Save draft", kind: publisher ? "secondary" : "primary" },
      ...(publisher ? [publish] : []),
      review,
    ];
  }
  if (status === "REVIEW") {
    return [
      { status: "REVIEW", label: "Save changes", kind: publisher ? "secondary" : "primary", description: "The record stays in review and is not public yet." },
      ...(publisher ? [{ ...publish, description: undefined }] : []),
      { status: "DRAFT", label: "Return to draft", kind: "secondary" },
    ];
  }
  if (status === "PUBLISHED") {
    return [
      ...(publisher ? [{ status: "PUBLISHED", label: "Save changes", kind: "primary", description: "This record is live: saved changes appear on the public website immediately." } as WorkflowAction] : []),
      ...(curator ? [{ status: "DRAFT", label: "Unpublish", kind: "secondary", confirm: "Remove this record from the public website? It is kept as a draft and can be published again later.", description: "Unpublishing removes the record from the public website and keeps it as a draft." } as WorkflowAction] : []),
    ];
  }
  if (status === "ARCHIVED") {
    return curator ? [{ status: "DRAFT", label: "Restore as draft", kind: "primary", description: "Archived records are not public. Restoring makes the record an editable draft again." }] : [];
  }
  return [];
}

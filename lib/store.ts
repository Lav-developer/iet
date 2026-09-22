import { publicCopy } from "@/lib/public-copy";
import type { DepartmentContact } from "@/lib/types";
import { facultyAssets } from "@/lib/public-content";
import { departmentScoped } from "@/lib/content-policy";
import { seedData } from "@/data/seed";
import { databaseConfigured, getPrisma } from "@/lib/db";
import { assertProductionConfig, isProduction } from "@/lib/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  Achievement,
  AuditEntry,
  ContactRecord,
  Department,
  DepartmentSocialLink,
  EntityName,
  EventItem,
  FacultyMember,
  Laboratory,
  LinkRecord,
  PageRecord,
  Program,
  MediaRecord,
  DocumentRecord,
  Notice,
  Project,
  Publication,
  ResearchArea,
  SiteData,
  SiteSetting,
  StudentOrganization,
} from "@/lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type StoreShape = SiteData;
const demoDataPath = path.join(process.cwd(), ".data", "demo-content.json");
const demoAuditPath = path.join(process.cwd(), ".data", "audit-log.json");

function readDemoStore(): StoreShape {
  try {
    if (existsSync(demoDataPath)) {
      // Merge over the seed so a store written by an earlier release still has
      // every collection (for example notices added in a later migration).
      return { ...clone(seedData), ...JSON.parse(readFileSync(demoDataPath, "utf8")) as StoreShape };
    }
  } catch (error) {
    console.warn("Could not read demo content store; using source seed.", error);
  }
  return clone(seedData);
}

function writeDemoStore(data: StoreShape) {
  mkdirSync(path.dirname(demoDataPath), { recursive: true });
  writeFileSync(demoDataPath, JSON.stringify(data, null, 2));
}

function readAuditEntries(): AuditEntry[] {
  try {
    if (existsSync(demoAuditPath)) return JSON.parse(readFileSync(demoAuditPath, "utf8")) as AuditEntry[];
  } catch (error) {
    console.warn("Could not read demo audit log; using a fresh log.", error);
  }
  return [{ id: "audit-seed", user: "system seed", action: "SEEDED", entity: "site", timestamp: new Date().toISOString(), after: { source: "IET26072026.pdf" } }];
}

function writeAuditEntries(entries: AuditEntry[]) {
  mkdirSync(path.dirname(demoAuditPath), { recursive: true });
  writeFileSync(demoAuditPath, JSON.stringify(entries, null, 2));
}

const entityLabels: Record<EntityName, string> = {
  departments: "Department",
  programs: "Program",
  faculty: "Faculty profile",
  laboratories: "Laboratory",
  researchAreas: "Research area",
  projects: "Project",
  publications: "Publication",
  achievements: "Achievement",
  events: "Event",
  notices: "Notice",
  organizations: "Student organization",
  pages: "Page",
  links: "External link",
  contacts: "Contact",
  settings: "Site setting",
  media: "Media asset",
  documents: "Document",
};

export function getEntityLabel(entity: EntityName) {
  return entityLabels[entity];
}

export const socialPlatformOrder: Record<string, number> = { INSTAGRAM: 0, FACEBOOK: 1, LINKEDIN: 2, X: 3, YOUTUBE: 4, WEBSITE: 5, OTHER: 6 };

/**
 * Public projection for department social links: only configured, well-formed
 * URLs are ever published, sorted by the stored order. Nothing here can render
 * markup — the value is always a URL plus an optional label.
 */
export function publicSocialLinks(links: DepartmentSocialLink[] | undefined): DepartmentSocialLink[] {
  return (links || [])
    .filter((link) => link && typeof link.url === "string" && /^https?:\/\//i.test(link.url.trim()))
    .map((link, index) => ({
      ...(link.id ? { id: link.id } : {}),
      platform: String(link.platform || "OTHER").toUpperCase(),
      url: link.url.trim(),
      ...(link.label ? { label: String(link.label) } : {}),
      order: typeof link.order === "number" ? link.order : index,
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Public projection for notices: a PDF notice is only publishable when its document is published. */
export function publicNotice(notice: Notice): Notice | undefined {
  const type = String(notice.noticeType || "TEXT").toUpperCase();
  if (type === "PDF" && !notice.pdf) return undefined;
  return { ...notice, noticeType: type === "PDF" ? "PDF" : "TEXT" };
}

function assertDataStoreAvailable() {
  if (isProduction) {
    assertProductionConfig();
    if (!databaseConfigured) throw new Error("DATABASE_URL is required in production.");
  }
}

export async function getSiteData(options?: { includeDrafts?: boolean }): Promise<SiteData> {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const data = await getDatabaseData(options?.includeDrafts ?? false);
    return options?.includeDrafts ? data : preparePublicData(data);
  }

  const data = readDemoStore();
  if (!options?.includeDrafts) return preparePublicData(filterPublished(data));
  return data;
}

/**
 * Counters for the administrator dashboard.
 *
 * The dashboard only ever displays totals, so it reads status aggregates —
 * four bounded queries, one at a time, without loading rows or relations —
 * instead of the whole dataset. This is the same per-entity read pattern the
 * other admin screens use (see `entityQueries`), so a dashboard request never
 * fans out across every entity at once.
 */
export type DashboardStat = { label: string; total: number; published: number; drafts: number };
export type DashboardSummary = {
  mode: "database" | "demo";
  stats: DashboardStat[];
  publishedDepartments: number;
  hasPublishedDepartment: boolean;
};

const dashboardEntities: { label: string; entity: "departments" | "programs" | "faculty" | "laboratories" }[] = [
  { label: "Departments", entity: "departments" },
  { label: "Programmes", entity: "programs" },
  { label: "Faculty & staff", entity: "faculty" },
  { label: "Laboratories", entity: "laboratories" },
];

function summarizeStatusCounts(rows: { status: string; _count: { _all: number } }[]) {
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const published = rows.filter((row) => row.status === "PUBLISHED").reduce((sum, row) => sum + row._count._all, 0);
  return { total, published };
}

function statFromRows(label: string, rows: { status?: string }[]): DashboardStat {
  const published = rows.filter((item) => item.status === "PUBLISHED").length;
  return { label, total: rows.length, published, drafts: rows.length - published };
}

export async function getDashboardSummary(scope?: EntityScope): Promise<DashboardSummary> {
  assertDataStoreAvailable();
  if (!databaseConfigured) {
    // Preview/dev file store: counted from the same records the dashboard
    // view has always shown (drafts included), scoped the same way as the
    // database path.
    const data = readDemoStore();
    const rowsFor = (entity: "departments" | "programs" | "faculty" | "laboratories") => {
      const rows = (data[entity] as { status?: string; departmentSlug?: string }[]) || [];
      if (!scope?.departmentSlug) return rows;
      return entity === "departments" ? rows.filter((row) => (row as { slug?: string }).slug === scope.departmentSlug) : rows.filter((row) => row.departmentSlug === scope.departmentSlug);
    };
    const stats = dashboardEntities.map(({ label, entity }) => statFromRows(label, rowsFor(entity)));
    return { mode: "demo", stats, publishedDepartments: stats[0].published, hasPublishedDepartment: stats[0].published > 0 };
  }

  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");

  // A department administrator's counters cover their own department only: the
  // scope is part of the aggregate query, so institution-wide totals are never
  // computed (or returned) for them.
  const departmentId = scope?.departmentSlug
    ? (await prisma.department.findUnique({ where: { slug: scope.departmentSlug }, select: { id: true } }))?.id
    : undefined;
  if (scope?.departmentSlug && !departmentId) {
    const stats = dashboardEntities.map(({ label }) => ({ label, total: 0, published: 0, drafts: 0 }));
    return { mode: "database", stats, publishedDepartments: 0, hasPublishedDepartment: false };
  }
  const departmentWhere = departmentId ? { departmentId } : {};

  // Sequential on purpose: one aggregate query at a time, so a dashboard
  // request never opens a connection per entity simultaneously.
  const departments = await prisma.department.groupBy({ by: ["status"], _count: { _all: true }, ...(departmentId ? { where: { id: departmentId } } : {}) });
  const programs = await prisma.program.groupBy({ by: ["status"], _count: { _all: true }, where: departmentWhere });
  const faculty = await prisma.facultyMember.groupBy({ by: ["status"], _count: { _all: true }, where: departmentWhere });
  const laboratories = await prisma.laboratory.groupBy({ by: ["status"], _count: { _all: true }, where: departmentWhere });
  const totals = [summarizeStatusCounts(departments), summarizeStatusCounts(programs), summarizeStatusCounts(faculty), summarizeStatusCounts(laboratories)];

  const stats = dashboardEntities.map(({ label }, index) => ({
    label,
    total: totals[index].total,
    published: totals[index].published,
    drafts: totals[index].total - totals[index].published,
  }));
  const departmentTotals = totals[0];
  return { mode: "database", stats, publishedDepartments: departmentTotals.published, hasPublishedDepartment: departmentTotals.published > 0 };
}

export async function getEntity(entity: EntityName, includeDrafts = true, scope?: EntityScope): Promise<unknown[]> {
  assertDataStoreAvailable();
  if (databaseConfigured) return (await getDatabaseEntity(entity, includeDrafts, scope)) || [];
  const records = readDemoStore()[entity] as unknown[];
  if (!includeDrafts) return records.filter((item: unknown) => (item as { status?: string }).status === "PUBLISHED");
  return clone(records);
}

/**
 * Targeted single-record read (one scoped query, never the whole dataset).
 * Used for authorization checks and audit before-snapshots.
 */
export async function getSingleEntityRecord(entity: EntityName, id: string): Promise<unknown | null> {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const rows = (await getDatabaseEntity(entity, true)) ?? [];
    return rows.find((item) => (item as { id?: string }).id === id) ?? null;
  }
  const list = readDemoStore()[entity] as unknown as Array<Record<string, unknown>>;
  return clone(list.find((item) => item.id === id) ?? null);
}

type TxClient = PrismaClient | Prisma.TransactionClient;

export async function upsertEntity(
  entity: EntityName,
  payload: Record<string, unknown>,
  actor = "demo admin",
  id?: string,
  actorId?: string,
  role?: string,
  ipAddress?: string,
) {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const before = id ? await getSingleEntityRecord(entity, id) : undefined;
    // Content mutation + relationship synchronization + audit logging are a
    // single transaction: a failed relationship update cannot leave partially
    // updated content or a missing audit entry.
    const saved = await prisma.$transaction(async (tx) => {
      const savedRow = await upsertDatabaseEntity(entity, payload, id, actorId, tx);
      await syncRelationships(entity, savedRow.id, payload, tx);
      await appendAuditEntry(tx, { user: actor, userId: actorId, role, ipAddress, action: id ? "UPDATED" : "CREATED", entity, entityId: String((savedRow as { id: string }).id), before, after: savedRow });
      await publishLinkedNoticeDocument(entity, savedRow, { user: actor, userId: actorId, role, ipAddress }, tx);
      return savedRow;
    });
    return saved;
  }

  const demoStore = readDemoStore();
  const list = demoStore[entity] as unknown as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  const generatedId = id || `${entity}-${Date.now()}`;
  const previous = id ? list.find((item) => item.id === id) : undefined;
  const nextStatus = payload.status || "DRAFT";
  const next = {
    ...payload,
    id: generatedId,
    status: nextStatus,
    publishedAt: nextStatus === "PUBLISHED" ? now : previous?.publishedAt,
    updatedAt: now,
    createdAt: previous?.createdAt || now,
  } as Record<string, unknown>;
  const index = id ? list.findIndex((item) => item.id === id) : -1;
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  // Publishing a PDF notice publishes exactly the PDF it links to (see
  // publishLinkedNoticeDocument for the database path).
  const linkedDocumentId = linkedNoticeDocumentToPublish(entity, next);
  const linkedDocument = linkedDocumentId ? (demoStore.documents as unknown as Array<Record<string, unknown>>).find((item) => item.id === linkedDocumentId) : undefined;
  const documentBefore = linkedDocument && linkedDocument.status !== "PUBLISHED" ? { ...linkedDocument } : undefined;
  if (linkedDocument && documentBefore) Object.assign(linkedDocument, { status: "PUBLISHED", updatedAt: now });
  writeDemoStore(demoStore);
  await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: id ? "UPDATED" : "CREATED", entity, entityId: generatedId, before: previous, after: next });
  if (linkedDocument && documentBefore) await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: "PUBLISHED_WITH_NOTICE", entity: "documents", entityId: String(linkedDocument.id), before: documentBefore, after: linkedDocument });
  return clone(next);
}

/**
 * The single document a just-saved notice makes public, if any.
 *
 * Publishing a PDF notice must make its PDF available without a second
 * approval in Documents — but only that one PDF: the notice's own link is the
 * only document ever touched, never any other draft in the library.
 */
export function linkedNoticeDocumentToPublish(entity: EntityName, saved: Record<string, unknown> | { id: string }): string | undefined {
  if (entity !== "notices") return undefined;
  const notice = saved as { status?: unknown; noticeType?: unknown; documentId?: unknown };
  if (notice.status !== "PUBLISHED") return undefined;
  if (String(notice.noticeType || "").toUpperCase() !== "PDF") return undefined;
  return typeof notice.documentId === "string" && notice.documentId ? notice.documentId : undefined;
}

/**
 * Database path of the rule above, inside the notice's own transaction: the
 * notice and its PDF become public together, and the document change carries
 * its own audit entry attributed to the publishing administrator.
 */
export async function publishLinkedNoticeDocument(entity: EntityName, saved: { id: string }, audit: { user: string; userId?: string; role?: string; ipAddress?: string }, client: TxClient) {
  const documentId = linkedNoticeDocumentToPublish(entity, saved);
  if (!documentId) return;
  const document = await client.document.findUnique({ where: { id: documentId } });
  if (!document || document.status === "PUBLISHED") return;
  const after = await client.document.update({ where: { id: document.id }, data: { status: "PUBLISHED", ...(audit.userId ? { updatedById: audit.userId } : {}) } });
  await appendAuditEntry(client, { ...audit, action: "PUBLISHED_WITH_NOTICE", entity: "documents", entityId: document.id, before: document, after });
}

export async function deleteEntity(entity: EntityName, id: string, actor = "demo admin", actorId?: string, role?: string, ipAddress?: string) {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const before = await getSingleEntityRecord(entity, id);
    if (!before) throw new Error("Record not found");
    await prisma.$transaction(async (tx) => {
      await deleteDatabaseEntity(entity, id, tx);
      await appendAuditEntry(tx, { user: actor, userId: actorId, role, ipAddress, action: "DELETED", entity, entityId: id, before });
    });
    return { id };
  }
  const demoStore = readDemoStore();
  const list = demoStore[entity] as unknown as Array<Record<string, unknown>>;
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Record not found");
  const [deleted] = list.splice(index, 1);
  writeDemoStore(demoStore);
  await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: "DELETED", entity, entityId: id, before: deleted });
  return { id };
}

export type AuditPage = { logs: AuditEntry[]; total: number; page: number; limit: number; totalPages: number };

export async function getAuditEntries(page = 1, limit = 100): Promise<AuditPage> {
  assertDataStoreAvailable();
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const [total, logs] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (safePage - 1) * safeLimit, take: safeLimit, include: { user: { select: { email: true, name: true } } } }),
    ]);
    return {
      logs: logs.map((log) => ({ ...log, user: log.user?.name || log.user?.email || log.userId || "system" })) as unknown as AuditEntry[],
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }
  const all = clone(readAuditEntries()).reverse();
  return { logs: all.slice((safePage - 1) * safeLimit, safePage * safeLimit), total: all.length, page: safePage, limit: safeLimit, totalPages: Math.max(1, Math.ceil(all.length / safeLimit)) };
}

async function appendAuditEntry(client: TxClient, entry: Omit<AuditEntry, "id" | "timestamp">) {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      role: entry.role as any,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ipAddress: entry.ipAddress,
      beforeJson: entry.before ? JSON.stringify(entry.before) : undefined,
      afterJson: entry.after ? JSON.stringify(entry.after) : undefined,
    },
  });
}

async function appendAudit(entry: Omit<AuditEntry, "id" | "timestamp">) {
  const audit: AuditEntry = { ...entry, id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`, timestamp: new Date().toISOString() };
  if (!databaseConfigured) {
    const entries = readAuditEntries();
    entries.push(audit);
    writeAuditEntries(entries);
    return;
  }
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required in production.");
  await appendAuditEntry(prisma, entry);
}

/** Remove internal fields and raw Prisma relation objects before client serialization. */
export function preparePublicData(data: SiteData): SiteData {
  const result = filterPublished(data);
  for (const collection of Object.keys(result) as EntityName[]) {
    if (collection === "settings") { result.settings = []; continue; }
    (result[collection] as unknown[]) = (result[collection] as unknown as Record<string, unknown>[]).map((row) => {
      const clean = { ...row };
      for (const key of ["sourceNote", "createdById", "updatedById", "department", "researchAreas", "laboratories", "faculty", "departments", "authors", "organization", "profileImage", "cvDocument"]) delete clean[key];
      if (clean.departmentSlug && !result.departments.some((d) => d.slug === clean.departmentSlug)) {
        delete clean.departmentName; delete clean.departmentSlug;
      }
      for (const [key, value] of Object.entries(clean)) {
        if (typeof value === "string") clean[key] = publicCopy(value);
      }
      return clean;
    });
  }
  result.faculty = result.faculty.map((person) => ({ ...person, ...facultyAssets(person, result) }));
  result.departments = result.departments.map((department) => ({ ...department, socialLinks: publicSocialLinks((department as Department).socialLinks) }));
  // A PDF notice whose document is missing or unpublished is not publishable:
  // the PDF itself would 404, so the notice must not appear publicly either.
  result.notices = result.notices
    .map((notice) => {
      const documentId = (notice as Notice & { documentId?: string | null }).documentId;
      const document = documentId ? result.documents.find((item) => item.id === documentId) : undefined;
      return { ...notice, ...(document ? { pdf: { url: document.url, title: document.title || notice.title } } : {}) };
    })
    .map(publicNotice)
    .filter((notice): notice is Notice => Boolean(notice));
  return result;
}

function filterPublished(data: SiteData): SiteData {
  const published = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === "PUBLISHED");
  return {
    departments: published(data.departments),
    programs: published(data.programs),
    faculty: published(data.faculty),
    laboratories: published(data.laboratories),
    researchAreas: published(data.researchAreas),
    projects: published(data.projects),
    publications: published(data.publications),
    achievements: published(data.achievements),
    events: published(data.events),
    notices: published(data.notices),
    organizations: published(data.organizations),
    pages: published(data.pages),
    links: published(data.links),
    contacts: published(data.contacts),
    settings: data.settings,
    media: data.media,
    documents: published(data.documents),
  };
}

/* ------------------------------------------------------------------ */
/* Database queries                                                    */
/* ------------------------------------------------------------------ */

function wherePublished(includeDrafts: boolean) {
  return includeDrafts ? {} : { status: "PUBLISHED" as const };
}

/**
 * A department scope is expressed as a relation filter on the department the
 * record belongs to, so PostgreSQL returns only that department's rows. It is
 * applied to the entities the policy models as department-owned; institution-
 * wide records (pages, links, contacts, settings, media) are never filtered.
 */
function scopedDepartmentWhere(entity: EntityName, scope?: EntityScope) {
  if (!scope?.departmentSlug) return {};
  return departmentScoped.has(entity) ? { department: { slug: scope.departmentSlug } } : {};
}

function mapFacultyRow(item: {
  id: string; slug: string; name: string; designation: string;
  researchInterests: string | null;
  department?: { slug: string; name: string } | null;
  researchAreas?: Array<{ researchArea: { name: string; slug: string } }>;
  laboratories?: Array<{ laboratory: { slug: string } }>;
}) {
  return {
    ...item,
    departmentSlug: item.department?.slug,
    departmentName: item.department?.name,
    researchInterests: item.researchInterests ? item.researchInterests.split("\n").filter(Boolean) : [],
    researchAreaSlugs: (item.researchAreas || []).map((area) => area.researchArea.slug),
    laboratorySlugs: (item.laboratories || []).map((join) => join.laboratory.slug),
  };
}

function mapRowWithDepartment<T extends { department?: { slug: string; name: string } | null }>(item: T) {
  return { ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name };
}

/**
 * Public/admin projection of configured department contacts. Contacts whose
 * person has no resolvable faculty record are dropped rather than being
 * replaced by anything else — an unconfigured department never inherits the
 * first faculty row.
 */
function mapDepartmentContacts(rows: { id: string; role: string; order: number; faculty?: { slug: string } | null }[] | undefined): Required<DepartmentContact>[] {
  return (rows || [])
    .filter((row) => Boolean(row.faculty?.slug))
    .map((row) => ({ id: row.id, role: row.role, order: row.order, facultySlug: String(row.faculty?.slug) }))
    .sort((a, b) => a.order - b.order || a.role.localeCompare(b.role, "en") || a.facultySlug.localeCompare(b.facultySlug, "en"));
}

/**
 * Server-side department scope for admin reads. It is applied in the database
 * query itself (never after fetching every row, and never in the browser), and
 * only to entities the policy marks as department-owned.
 */
export type EntityScope = { departmentSlug?: string };
type EntityQuery = (prisma: PrismaClient, includeDrafts: boolean, scope?: EntityScope) => Promise<unknown[]>;

/**
 * One scoped query per entity — used by admin entity reads, single-record
 * reads, audit snapshots and public site data. Nothing here loads the whole
 * dataset for a single-entity operation.
 */
const entityQueries: Record<EntityName, EntityQuery> = {
  departments: (prisma, includeDrafts) =>
    prisma.department
      .findMany({ where: wherePublished(includeDrafts), include: { socialLinks: true, contacts: { include: { faculty: { select: { slug: true } } } } }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, socialLinks: publicSocialLinks(item.socialLinks), contacts: mapDepartmentContacts(item.contacts) }))),
  programs: (prisma, includeDrafts, scope) =>
    prisma.program
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("programs", scope) }, include: { department: true, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug) }))),
  faculty: (prisma, includeDrafts, scope) =>
    prisma.facultyMember
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("faculty", scope) }, include: { department: true, researchAreas: { include: { researchArea: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { name: "asc" } })
      .then((rows) => rows.map(mapFacultyRow)),
  laboratories: (prisma, includeDrafts, scope) =>
    prisma.laboratory
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("laboratories", scope) }, include: { department: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  researchAreas: (prisma, includeDrafts) =>
    prisma.researchArea
      .findMany({ where: wherePublished(includeDrafts), include: { faculty: { include: { faculty: true } }, departments: { include: { department: true } } }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, facultySlugs: item.faculty.map((join) => join.faculty.slug), departmentSlugs: item.departments.map((join) => join.department.slug) }))),
  projects: (prisma, includeDrafts, scope) =>
    prisma.project
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("projects", scope) }, include: { department: true, faculty: { include: { faculty: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, facultySlugs: item.faculty.map((join) => join.faculty.slug), laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug) }))),
  publications: (prisma, includeDrafts, scope) =>
    prisma.publication
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("publications", scope) }, include: { department: true, authors: { include: { faculty: true } } }, orderBy: { year: "desc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, authorSlugs: item.authors.map((author) => author.faculty.slug) }))),
  achievements: (prisma, includeDrafts, scope) =>
    prisma.achievement
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("achievements", scope) }, include: { department: true }, orderBy: { year: "desc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  events: (prisma, includeDrafts, scope) =>
    prisma.event
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("events", scope) }, include: { department: true }, orderBy: { startsAt: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  notices: (prisma, includeDrafts, scope) =>
    prisma.notice
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("notices", scope) }, include: { department: true, document: true }, orderBy: [{ noticeDate: "desc" }, { createdAt: "desc" }] })
      .then((rows) => rows.map((item) => ({
        ...mapRowWithDepartment(item),
        pdf: item.document && item.document.status === "PUBLISHED" && item.document.mimeType === "application/pdf"
          ? { url: item.document.url, title: item.document.title }
          : undefined,
      }))),
  organizations: (prisma, includeDrafts, scope) =>
    prisma.studentOrganization
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("organizations", scope) }, include: { department: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  pages: (prisma, includeDrafts) =>
    prisma.page.findMany({ where: wherePublished(includeDrafts), orderBy: { title: "asc" } }),
  links: (prisma, includeDrafts) =>
    prisma.link.findMany({ where: wherePublished(includeDrafts), orderBy: { order: "asc" } }),
  contacts: (prisma, includeDrafts) =>
    prisma.contact.findMany({ where: wherePublished(includeDrafts), orderBy: { label: "asc" } }),
  settings: (prisma) =>
    prisma.siteSetting.findMany({ orderBy: { key: "asc" } }),
  media: (prisma) =>
    prisma.media.findMany({ orderBy: { createdAt: "desc" } }),
  documents: (prisma, includeDrafts, scope) =>
    prisma.document
      .findMany({ where: { ...wherePublished(includeDrafts), ...scopedDepartmentWhere("documents", scope) }, include: { department: true }, orderBy: { title: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
};

async function getDatabaseEntity(entity: EntityName, includeDrafts: boolean, scope?: EntityScope): Promise<unknown[] | null> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");
  return entityQueries[entity](prisma, includeDrafts, scope);
}

async function getDatabaseData(includeDrafts: boolean): Promise<SiteData> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");
  const [departments, programs, faculty, laboratories, researchAreas, projects, publications, achievements, events, notices, organizations, pages, links, contacts, settings, media, documents] = await Promise.all([
    entityQueries.departments(prisma, includeDrafts),
    entityQueries.programs(prisma, includeDrafts),
    entityQueries.faculty(prisma, includeDrafts),
    entityQueries.laboratories(prisma, includeDrafts),
    entityQueries.researchAreas(prisma, includeDrafts),
    entityQueries.projects(prisma, includeDrafts),
    entityQueries.publications(prisma, includeDrafts),
    entityQueries.achievements(prisma, includeDrafts),
    entityQueries.events(prisma, includeDrafts),
    entityQueries.notices(prisma, includeDrafts),
    entityQueries.organizations(prisma, includeDrafts),
    entityQueries.pages(prisma, includeDrafts),
    entityQueries.links(prisma, includeDrafts),
    entityQueries.contacts(prisma, includeDrafts),
    entityQueries.settings(prisma, false),
    entityQueries.media(prisma, false),
    entityQueries.documents(prisma, includeDrafts),
  ]);

  return {
    departments: departments as unknown as Department[],
    faculty: faculty as unknown as FacultyMember[],
    laboratories: laboratories as unknown as Laboratory[],
    researchAreas: researchAreas as unknown as ResearchArea[],
    programs: programs as unknown as Program[],
    projects: projects as unknown as Project[],
    publications: publications as unknown as Publication[],
    achievements: achievements as unknown as Achievement[],
    events: events as unknown as EventItem[],
    notices: notices as unknown as Notice[],
    organizations: organizations as unknown as StudentOrganization[],
    pages: pages as unknown as PageRecord[],
    links: links as unknown as LinkRecord[],
    contacts: contacts as unknown as ContactRecord[],
    settings: settings as unknown as SiteSetting[],
    media: media as unknown as MediaRecord[],
    documents: documents as unknown as DocumentRecord[],
  };
}

async function upsertDatabaseEntity(entity: EntityName, payload: Record<string, unknown>, id: string | undefined, actorId: string | undefined, client: TxClient) {
  const data = await normalizeDatabasePayload(entity, payload, id, actorId, client);
  const where = id ? { id } : undefined;
  let saved: { id: string };
  switch (entity) {
    case "departments": saved = (id ? await client.department.update({ where: where!, data: data as never }) : await client.department.create({ data: data as never })); break;
    case "programs": saved = (id ? await client.program.update({ where: where!, data: data as never }) : await client.program.create({ data: data as never })); break;
    case "faculty": saved = (id ? await client.facultyMember.update({ where: where!, data: data as never }) : await client.facultyMember.create({ data: data as never })); break;
    case "laboratories": saved = (id ? await client.laboratory.update({ where: where!, data: data as never }) : await client.laboratory.create({ data: data as never })); break;
    case "researchAreas": saved = (id ? await client.researchArea.update({ where: where!, data: data as never }) : await client.researchArea.create({ data: data as never })); break;
    case "projects": saved = (id ? await client.project.update({ where: where!, data: data as never }) : await client.project.create({ data: data as never })); break;
    case "publications": saved = (id ? await client.publication.update({ where: where!, data: data as never }) : await client.publication.create({ data: data as never })); break;
    case "achievements": saved = (id ? await client.achievement.update({ where: where!, data: data as never }) : await client.achievement.create({ data: data as never })); break;
    case "events": saved = (id ? await client.event.update({ where: where!, data: data as never }) : await client.event.create({ data: data as never })); break;
    case "notices": saved = (id ? await client.notice.update({ where: where!, data: data as never }) : await client.notice.create({ data: data as never })); break;
    case "organizations": saved = (id ? await client.studentOrganization.update({ where: where!, data: data as never }) : await client.studentOrganization.create({ data: data as never })); break;
    case "pages": saved = (id ? await client.page.update({ where: where!, data: data as never }) : await client.page.create({ data: data as never })); break;
    case "links": saved = (id ? await client.link.update({ where: where!, data: data as never }) : await client.link.create({ data: data as never })); break;
    case "contacts": saved = (id ? await client.contact.update({ where: where!, data: data as never }) : await client.contact.create({ data: data as never })); break;
    case "settings": saved = (id ? await client.siteSetting.update({ where: where!, data: data as never }) : await client.siteSetting.create({ data: data as never })); break;
    case "media": saved = (id ? await client.media.update({ where: where!, data: data as never }) : await client.media.create({ data: data as never })); break;
    case "documents": saved = (id ? await client.document.update({ where: where!, data: data as never }) : await client.document.create({ data: data as never })); break;
    default: throw new Error("Unsupported entity");
  }
  return saved;
}

async function deleteDatabaseEntity(entity: EntityName, id: string, client: TxClient) {
  switch (entity) {
    case "departments": return client.department.delete({ where: { id } });
    case "programs": return client.program.delete({ where: { id } });
    case "faculty": return client.facultyMember.delete({ where: { id } });
    case "laboratories": return client.laboratory.delete({ where: { id } });
    case "researchAreas": return client.researchArea.delete({ where: { id } });
    case "projects": return client.project.delete({ where: { id } });
    case "publications": return client.publication.delete({ where: { id } });
    case "achievements": return client.achievement.delete({ where: { id } });
    case "events": return client.event.delete({ where: { id } });
    case "notices": return client.notice.delete({ where: { id } });
    case "organizations": return client.studentOrganization.delete({ where: { id } });
    case "pages": return client.page.delete({ where: { id } });
    case "links": return client.link.delete({ where: { id } });
    case "contacts": return client.contact.delete({ where: { id } });
    case "settings": return client.siteSetting.delete({ where: { id } });
    case "media": return client.media.delete({ where: { id } });
    case "documents": return client.document.delete({ where: { id } });
    default: throw new Error("Unsupported entity");
  }
}

function relationValues(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

async function syncRelationships(entity: EntityName, id: string, payload: Record<string, unknown>, client: TxClient) {
  const resolveFaculty = async (values: string[]) => client.facultyMember.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveLaboratories = async (values: string[]) => client.laboratory.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveResearchAreas = async (values: string[]) => client.researchArea.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveDepartments = async (values: string[]) => client.department.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });

  if (entity === "departments" && payload.socialLinks !== undefined) {
    // Social links are owned by the department: the submitted list replaces the
    // stored list atomically, so add/edit/remove all work through one save.
    const links = Array.isArray(payload.socialLinks) ? payload.socialLinks as Record<string, unknown>[] : [];
    await client.departmentSocialLink.deleteMany({ where: { departmentId: id } });
    if (links.length) {
      await client.departmentSocialLink.createMany({
        data: links.map((link, index) => ({
          departmentId: id,
          platform: String(link.platform),
          url: String(link.url),
          label: link.label ? String(link.label) : null,
          order: typeof link.order === "number" ? link.order : index,
        })),
      });
    }
  }
  if (entity === "programs" && payload.laboratorySlugs !== undefined) {
    const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
    await client.programLaboratory.deleteMany({ where: { programId: id } });
    if (values.length) await client.programLaboratory.createMany({ data: values.map((item) => ({ programId: id, laboratoryId: item.id })), skipDuplicates: true });
  }
  if (entity === "faculty") {
    if (payload.researchAreaSlugs !== undefined) {
      const values = await resolveResearchAreas(relationValues(payload.researchAreaSlugs));
      await client.facultyResearchArea.deleteMany({ where: { facultyId: id } });
      if (values.length) await client.facultyResearchArea.createMany({ data: values.map((item) => ({ facultyId: id, researchAreaId: item.id })), skipDuplicates: true });
    }
    if (payload.laboratorySlugs !== undefined) {
      const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
      await client.facultyLaboratory.deleteMany({ where: { facultyId: id } });
      if (values.length) await client.facultyLaboratory.createMany({ data: values.map((item) => ({ facultyId: id, laboratoryId: item.id })), skipDuplicates: true });
    }
  }
  if (entity === "researchAreas") {
    if (payload.facultySlugs !== undefined) {
      const values = await resolveFaculty(relationValues(payload.facultySlugs));
      await client.facultyResearchArea.deleteMany({ where: { researchAreaId: id } });
      if (values.length) await client.facultyResearchArea.createMany({ data: values.map((item) => ({ facultyId: item.id, researchAreaId: id })), skipDuplicates: true });
    }
    if (payload.departmentSlugs !== undefined) {
      const values = await resolveDepartments(relationValues(payload.departmentSlugs));
      await client.departmentResearchArea.deleteMany({ where: { researchAreaId: id } });
      if (values.length) await client.departmentResearchArea.createMany({ data: values.map((item) => ({ departmentId: item.id, researchAreaId: id })), skipDuplicates: true });
    }
  }
  if (entity === "projects") {
    if (payload.facultySlugs !== undefined) {
      const values = await resolveFaculty(relationValues(payload.facultySlugs));
      await client.projectFaculty.deleteMany({ where: { projectId: id } });
      if (values.length) await client.projectFaculty.createMany({ data: values.map((item) => ({ projectId: id, facultyId: item.id })), skipDuplicates: true });
    }
    if (payload.laboratorySlugs !== undefined) {
      const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
      await client.projectLaboratory.deleteMany({ where: { projectId: id } });
      if (values.length) await client.projectLaboratory.createMany({ data: values.map((item) => ({ projectId: id, laboratoryId: item.id })), skipDuplicates: true });
    }
  }
  if (entity === "publications" && payload.authorSlugs !== undefined) {
    const values = await resolveFaculty(relationValues(payload.authorSlugs));
    await client.publicationFaculty.deleteMany({ where: { publicationId: id } });
    if (values.length) await client.publicationFaculty.createMany({ data: values.map((item) => ({ publicationId: id, facultyId: item.id })), skipDuplicates: true });
  }
}

/**
 * Entities whose Prisma model declares a `publishedAt` column.
 *
 * `Document`, `Link` and `Contact` carry the editorial status without a publish
 * timestamp. Prisma rejects a write that sends `publishedAt` to those models,
 * which surfaced as a failed PDF upload (documents) and failed link/contact
 * edits, so the timestamp is written only for the models that declare it.
 * `tests/entity-persistence.test.ts` compares this list with prisma/schema.prisma.
 */
export const entitiesWithPublishedAt: ReadonlySet<EntityName> = new Set<EntityName>([
  "departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "achievements", "events", "organizations", "pages", "notices",
]);

async function normalizeDatabasePayload(entity: EntityName, payload: Record<string, unknown>, id: string | undefined, actorId: string | undefined, client: TxClient) {
  const omit = new Set(["id", "createdAt", "updatedAt", "publishedAt", "departmentName", "departmentSlug", "status", "authorSlugs", "facultySlugs", "laboratorySlugs", "researchAreaSlugs", "departmentSlugs", "socialLinks"]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!omit.has(key) && value !== undefined) data[key] = value;
  }
  // The server owns publishedAt: set on transition to PUBLISHED, cleared on
  // any other transition. Client-supplied timestamps are never trusted, which
  // prevents stale publishedAt values on unpublished records.
  if (payload.status !== undefined) {
    data.status = payload.status;
    if (entitiesWithPublishedAt.has(entity)) data.publishedAt = payload.status === "PUBLISHED" ? new Date() : null;
  } else if (!id && entity !== "settings" && entity !== "media") {
    data.status = "DRAFT";
  }
  if (entity === "programs" && payload.approvedSeats !== undefined && payload.approvedSeats !== "") data.approvedSeats = Number(payload.approvedSeats);
  if (["achievements", "publications"].includes(entity) && payload.year !== undefined && payload.year !== "") data.year = Number(payload.year);
  if (["media", "documents"].includes(entity) && payload.sizeBytes !== undefined && payload.sizeBytes !== "") data.sizeBytes = Number(payload.sizeBytes);
  for (const key of ["profileImageId", "cvDocumentId", "organizationId", "documentId"]) {
    if (payload[key] === "") data[key] = null;
  }
  if (entity === "faculty" && Array.isArray(payload.researchInterests)) data.researchInterests = payload.researchInterests.map(String).join("\n");
  if (entity === "events") {
    if (payload.startsAt) data.startsAt = new Date(String(payload.startsAt));
    else if (payload.startsAt === "") data.startsAt = null;
    if (payload.endsAt) data.endsAt = new Date(String(payload.endsAt));
    else if (payload.endsAt === "") data.endsAt = null;
  }
  if (entity === "notices") {
    // Only normalise the type when the request actually carries one. Deriving it
    // unconditionally defaulted every partial update to TEXT, so a workflow-only
    // status change silently turned a PDF notice into an empty text notice (the
    // document stayed attached). New records fall back to the model default.
    if (payload.noticeType !== undefined) data.noticeType = String(payload.noticeType).toUpperCase() === "PDF" ? "PDF" : "TEXT";
    for (const key of ["noticeDate", "expiryDate"]) {
      if (payload[key] === "" || payload[key] === null) data[key] = key === "noticeDate" ? new Date() : null;
      else if (payload[key] !== undefined) data[key] = new Date(String(payload[key]));
    }
  }
  if (["publications", "notices"].includes(entity) && !data.slug && payload.title) data.slug = slugify(String(payload.title));
  if (payload.departmentSlug && ["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "notices", "organizations", "documents"].includes(entity)) {
    const department = await client.department.findUnique({ where: { slug: String(payload.departmentSlug) }, select: { id: true } });
    data.departmentId = department?.id;
  }
  for (const key of ["departmentSlug", "departmentName"]) delete data[key];
  if (actorId) {
    data.updatedById = actorId;
    if (!id) data.createdById = actorId;
  }
  return data;
}

export type SearchRecord = { id: string; type: string; title: string; description: string; href: string; meta?: string | null };

export async function searchSite(query: string): Promise<SearchRecord[]> {
  const normalized = query.trim().slice(0, 120);
  if (normalized.length < 2) return [];
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const results = await prisma.$queryRaw<SearchRecord[]>`
      SELECT id, 'Department' AS type, name AS title, overview AS description,
        '/departments/' || slug AS href, "shortName" AS meta
      FROM "Department" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, overview, "shortName")) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Programme', title, summary, '/programs/' || slug, "shortTitle"
      FROM "Program" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, "shortTitle", level)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Faculty', name, concat_ws('. ', designation, profile, "researchInterests"), '/faculty/' || slug, designation
      FROM "FacultyMember" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, designation, profile, "researchInterests")) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Laboratory', name, description, '/laboratories/' || slug, NULL
      FROM "Laboratory" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, description, equipment, courses, "researchRelevance")) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Research area', name, description, '/research#' || slug, NULL
      FROM "ResearchArea" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, description)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Project', title, summary, '/projects#' || slug, sponsor
      FROM "Project" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, sponsor)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Publication', title, coalesce(abstract, venue, ''), '/publications#' || slug, venue
      FROM "Publication" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, abstract, venue, doi)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Event', title, summary, '/events#' || slug, location
      FROM "Event" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, location)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Achievement', title, description, '/achievements', category
      FROM "Achievement" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, description, category, recipient)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Notice', title, coalesce(summary, body, 'Notice'), '/notices/' || slug, category
      FROM "Notice" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, body, category)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Organization', name, description, '/organizations/' || slug, NULL
      FROM "StudentOrganization" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, description)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Page', title, coalesce(excerpt, body), '/' || slug, locale
      FROM "Page" WHERE status = 'PUBLISHED' AND locale = 'en' AND to_tsvector('simple', concat_ws(' ', title, excerpt, body)) @@ websearch_to_tsquery('simple', ${normalized})
      LIMIT 100
    `;
    return results.map((item) => ({ ...item, title: publicCopy(item.title), description: publicCopy(item.description) }));
  }
  const data = await getSiteData();
  const records: SearchRecord[] = [
    ...data.pages.filter((item) => item.locale === "en").map((item) => ({ id: item.id, type: "Page", title: item.title, description: item.excerpt || item.body, href: `/${item.slug}` })),
    ...data.departments.map((item) => ({ id: item.id, type: "Department", title: item.name, description: item.overview, href: `/departments/${item.slug}`, meta: item.shortName })),
    ...data.programs.map((item) => ({ id: item.id, type: "Programme", title: item.title, description: item.summary, href: `/programs/${item.slug}`, meta: item.departmentName })),
    ...data.faculty.map((item) => ({ id: item.id, type: "Faculty", title: item.name, description: `${item.designation}. ${item.profile || ""}`, href: `/faculty/${item.slug}`, meta: item.departmentName })),
    ...data.laboratories.map((item) => ({ id: item.id, type: "Laboratory", title: item.name, description: item.description, href: `/laboratories/${item.slug}`, meta: item.departmentName })),
    ...data.researchAreas.map((item) => ({ id: item.id, type: "Research area", title: item.name, description: item.description, href: `/research#${item.slug}` })),
    ...data.projects.map((item) => ({ id: item.id, type: "Project", title: item.title, description: item.summary, href: `/projects#${item.slug}` })),
    ...data.publications.map((item) => ({ id: item.id, type: "Publication", title: item.title, description: item.abstract || item.venue || "Publication", href: `/publications#${item.slug}` })),
    ...data.events.map((item) => ({ id: item.id, type: "Event", title: item.title, description: item.summary, href: `/events#${item.slug}` })),
    ...data.notices.map((item) => ({ id: item.id, type: "Notice", title: item.title, description: item.summary || item.body || "Notice", href: `/notices/${item.slug}`, meta: item.category })),
    ...data.organizations.map((item) => ({ id: item.id, type: "Organization", title: item.name, description: item.description, href: `/organizations/${item.slug}` })),
    ...data.achievements.map((item) => ({ id: item.id, type: "Achievement", title: item.title, description: item.description, href: "/achievements" })),
  ];
  return records.filter((item) => `${item.title} ${item.description} ${item.meta || ""} ${item.type}`.toLowerCase().includes(normalized.toLowerCase())).slice(0, 100);
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

export type DepartmentContactConfig = {
  department: { id: string; slug: string; name: string };
  /** Configured contacts, in display order, with their person's own details. */
  contacts: { id: string; role: string; order: number; facultyId: string; facultySlug: string; facultyName: string; facultyDesignation: string }[];
  /** Selectable people for this department only (never another department's staff). */
  faculty: { id: string; slug: string; name: string; designation: string; status: string }[];
};

/**
 * Reads exactly one department's contact configuration. Two scoped queries
 * (department + that department's faculty) — never the whole faculty table,
 * and never a list of the other departments.
 */
export async function getDepartmentContactConfig(departmentIdOrSlug: string): Promise<DepartmentContactConfig | null> {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const department = await prisma.department.findFirst({
      where: { OR: [{ id: departmentIdOrSlug }, { slug: departmentIdOrSlug }] },
      select: { id: true, slug: true, name: true },
    });
    if (!department) return null;
    const [contacts, faculty] = await Promise.all([
      prisma.departmentContact.findMany({
        where: { departmentId: department.id, faculty: { departmentId: department.id } },
        include: { faculty: { select: { id: true, slug: true, name: true, designation: true } } },
        orderBy: [{ order: "asc" }, { role: "asc" }],
      }),
      prisma.facultyMember.findMany({ where: { departmentId: department.id }, select: { id: true, slug: true, name: true, designation: true, status: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      department,
      contacts: contacts.map((row) => ({ id: row.id, role: row.role, order: row.order, facultyId: row.facultyId, facultySlug: row.faculty.slug, facultyName: row.faculty.name, facultyDesignation: row.faculty.designation })),
      faculty,
    };
  }

  const store = readDemoStore();
  const department = store.departments.find((item) => item.id === departmentIdOrSlug || item.slug === departmentIdOrSlug);
  if (!department) return null;
  const people = store.faculty.filter((person) => person.departmentSlug === department.slug);
  const bySlug = new Map(people.map((person) => [person.slug, person]));
  const contacts = mapDepartmentContacts((department.contacts || []).map((entry, index) => ({ id: entry.id || `deptcontact-${department.id}-${index}`, role: entry.role, order: entry.order ?? index, faculty: { slug: entry.facultySlug } })))
    .map((entry) => {
      const person = bySlug.get(entry.facultySlug);
      return person ? { id: entry.id, role: entry.role, order: entry.order, facultyId: person.id, facultySlug: person.slug, facultyName: person.name, facultyDesignation: person.designation } : undefined;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return {
    department: { id: department.id, slug: department.slug, name: department.name },
    contacts,
    faculty: people.map((person) => ({ id: person.id, slug: person.slug, name: person.name, designation: person.designation, status: person.status })),
  };
}

/**
 * Replaces one department's configured contacts atomically. The caller has
 * already authorized the actor (see `canConfigureDepartmentContacts`); this
 * function additionally guarantees that every selected person belongs to that
 * same department, so a department's contact card can never point at another
 * department's faculty.
 */
export async function replaceDepartmentContacts(
  input: { departmentId: string; contacts: { role: string; facultySlug: string; order: number }[] },
  actor: { id?: string; email: string; role: string; ipAddress?: string },
): Promise<DepartmentContactConfig> {
  assertDataStoreAvailable();
  const stored = await getDepartmentContactConfig(input.departmentId);
  if (!stored) throw new Error("Department not found");

  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const people = await prisma.facultyMember.findMany({ where: { departmentId: stored.department.id, slug: { in: input.contacts.map((contact) => contact.facultySlug) } }, select: { id: true, slug: true } });
    const bySlug = new Map(people.map((person) => [person.slug, person.id]));
    if (bySlug.size !== input.contacts.length) throw new Error("INVALID_INPUT: A selected person does not belong to this department.");
    const before = stored.contacts;
    await prisma.$transaction(async (tx) => {
      await tx.departmentContact.deleteMany({ where: { departmentId: stored.department.id } });
      if (input.contacts.length) {
        await tx.departmentContact.createMany({
          data: input.contacts.map((contact, index) => ({ departmentId: stored.department.id, facultyId: bySlug.get(contact.facultySlug) as string, role: contact.role, order: typeof contact.order === "number" ? contact.order : index })),
        });
      }
      await appendAuditEntry(tx, { user: actor.email, userId: actor.id, role: actor.role, ipAddress: actor.ipAddress, action: "UPDATED", entity: "departmentContacts", entityId: stored.department.id, before, after: input.contacts });
    });
    const saved = await getDepartmentContactConfig(stored.department.id);
    if (!saved) throw new Error("Department not found");
    return saved;
  }

  const store = readDemoStore();
  const department = store.departments.find((item) => item.id === stored.department.id);
  if (!department) throw new Error("Department not found");
  const people = store.faculty.filter((person) => person.departmentSlug === department.slug);
  const bySlug = new Map(people.map((person) => [person.slug, person.id]));
  if (input.contacts.some((contact) => !bySlug.has(contact.facultySlug))) throw new Error("INVALID_INPUT: A selected person does not belong to this department.");
  const before = stored.contacts;
  department.contacts = input.contacts.map((contact, index) => ({ id: `deptcontact-${department.id}-${index}`, role: contact.role, order: typeof contact.order === "number" ? contact.order : index, facultySlug: contact.facultySlug }));
  writeDemoStore(store);
  await appendAudit({ user: actor.email, userId: actor.id, role: actor.role, ipAddress: actor.ipAddress, action: "UPDATED", entity: "departmentContacts", entityId: department.id, before, after: input.contacts });
  const saved = await getDepartmentContactConfig(department.id);
  if (!saved) throw new Error("Department not found");
  return saved;
}

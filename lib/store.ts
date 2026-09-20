import { publicCopy } from "@/lib/public-copy";
import { facultyAssets } from "@/lib/public-content";
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
  EntityName,
  EventItem,
  FacultyMember,
  Laboratory,
  LinkRecord,
  PageRecord,
  Program,
  MediaRecord,
  DocumentRecord,
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
    if (existsSync(demoDataPath)) return JSON.parse(readFileSync(demoDataPath, "utf8")) as StoreShape;
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

export async function getEntity(entity: EntityName, includeDrafts = true): Promise<unknown[]> {
  assertDataStoreAvailable();
  if (databaseConfigured) return (await getDatabaseEntity(entity, includeDrafts)) || [];
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
  writeDemoStore(demoStore);
  await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: id ? "UPDATED" : "CREATED", entity, entityId: generatedId, before: previous, after: next });
  return clone(next);
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

type EntityQuery = (prisma: PrismaClient, includeDrafts: boolean) => Promise<unknown[]>;

/**
 * One scoped query per entity — used by admin entity reads, single-record
 * reads, audit snapshots and public site data. Nothing here loads the whole
 * dataset for a single-entity operation.
 */
const entityQueries: Record<EntityName, EntityQuery> = {
  departments: (prisma, includeDrafts) =>
    prisma.department.findMany({ where: wherePublished(includeDrafts), orderBy: { name: "asc" } }),
  programs: (prisma, includeDrafts) =>
    prisma.program
      .findMany({ where: wherePublished(includeDrafts), include: { department: true, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug) }))),
  faculty: (prisma, includeDrafts) =>
    prisma.facultyMember
      .findMany({ where: wherePublished(includeDrafts), include: { department: true, researchAreas: { include: { researchArea: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { name: "asc" } })
      .then((rows) => rows.map(mapFacultyRow)),
  laboratories: (prisma, includeDrafts) =>
    prisma.laboratory
      .findMany({ where: wherePublished(includeDrafts), include: { department: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  researchAreas: (prisma, includeDrafts) =>
    prisma.researchArea
      .findMany({ where: wherePublished(includeDrafts), include: { faculty: { include: { faculty: true } }, departments: { include: { department: true } } }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, facultySlugs: item.faculty.map((join) => join.faculty.slug), departmentSlugs: item.departments.map((join) => join.department.slug) }))),
  projects: (prisma, includeDrafts) =>
    prisma.project
      .findMany({ where: wherePublished(includeDrafts), include: { department: true, faculty: { include: { faculty: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, facultySlugs: item.faculty.map((join) => join.faculty.slug), laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug) }))),
  publications: (prisma, includeDrafts) =>
    prisma.publication
      .findMany({ where: wherePublished(includeDrafts), include: { department: true, authors: { include: { faculty: true } } }, orderBy: { year: "desc" } })
      .then((rows) => rows.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, authorSlugs: item.authors.map((author) => author.faculty.slug) }))),
  achievements: (prisma, includeDrafts) =>
    prisma.achievement
      .findMany({ where: wherePublished(includeDrafts), include: { department: true }, orderBy: { year: "desc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  events: (prisma, includeDrafts) =>
    prisma.event
      .findMany({ where: wherePublished(includeDrafts), include: { department: true }, orderBy: { startsAt: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
  organizations: (prisma, includeDrafts) =>
    prisma.studentOrganization
      .findMany({ where: wherePublished(includeDrafts), include: { department: true }, orderBy: { name: "asc" } })
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
  documents: (prisma, includeDrafts) =>
    prisma.document
      .findMany({ where: wherePublished(includeDrafts), include: { department: true }, orderBy: { title: "asc" } })
      .then((rows) => rows.map(mapRowWithDepartment)),
};

async function getDatabaseEntity(entity: EntityName, includeDrafts: boolean): Promise<unknown[] | null> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");
  return entityQueries[entity](prisma, includeDrafts);
}

async function getDatabaseData(includeDrafts: boolean): Promise<SiteData> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");
  const [departments, programs, faculty, laboratories, researchAreas, projects, publications, achievements, events, organizations, pages, links, contacts, settings, media, documents] = await Promise.all([
    entityQueries.departments(prisma, includeDrafts),
    entityQueries.programs(prisma, includeDrafts),
    entityQueries.faculty(prisma, includeDrafts),
    entityQueries.laboratories(prisma, includeDrafts),
    entityQueries.researchAreas(prisma, includeDrafts),
    entityQueries.projects(prisma, includeDrafts),
    entityQueries.publications(prisma, includeDrafts),
    entityQueries.achievements(prisma, includeDrafts),
    entityQueries.events(prisma, includeDrafts),
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

async function normalizeDatabasePayload(entity: EntityName, payload: Record<string, unknown>, id: string | undefined, actorId: string | undefined, client: TxClient) {
  const omit = new Set(["id", "createdAt", "updatedAt", "publishedAt", "departmentName", "departmentSlug", "status", "authorSlugs", "facultySlugs", "laboratorySlugs", "researchAreaSlugs", "departmentSlugs"]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!omit.has(key) && value !== undefined) data[key] = value;
  }
  // The server owns publishedAt: set on transition to PUBLISHED, cleared on
  // any other transition. Client-supplied timestamps are never trusted, which
  // prevents stale publishedAt values on unpublished records.
  if (payload.status !== undefined) {
    data.status = payload.status;
    data.publishedAt = payload.status === "PUBLISHED" ? new Date() : null;
  } else if (!id && entity !== "settings" && entity !== "media") {
    data.status = "DRAFT";
  }
  if (entity === "programs" && payload.approvedSeats !== undefined && payload.approvedSeats !== "") data.approvedSeats = Number(payload.approvedSeats);
  if (["achievements", "publications"].includes(entity) && payload.year !== undefined && payload.year !== "") data.year = Number(payload.year);
  if (["media", "documents"].includes(entity) && payload.sizeBytes !== undefined && payload.sizeBytes !== "") data.sizeBytes = Number(payload.sizeBytes);
  for (const key of ["profileImageId", "cvDocumentId", "organizationId"]) {
    if (payload[key] === "") data[key] = null;
  }
  if (entity === "faculty" && Array.isArray(payload.researchInterests)) data.researchInterests = payload.researchInterests.map(String).join("\n");
  if (entity === "events") {
    if (payload.startsAt) data.startsAt = new Date(String(payload.startsAt));
    else if (payload.startsAt === "") data.startsAt = null;
    if (payload.endsAt) data.endsAt = new Date(String(payload.endsAt));
    else if (payload.endsAt === "") data.endsAt = null;
  }
  if (entity === "publications" && !data.slug && payload.title) data.slug = slugify(String(payload.title));
  if (payload.departmentSlug && ["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "organizations", "documents"].includes(entity)) {
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

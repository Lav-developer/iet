import { seedData } from "@/data/seed";
import { databaseConfigured, getPrisma } from "@/lib/db";
import { assertProductionConfig, isProduction } from "@/lib/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
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
  if (databaseConfigured) return getDatabaseData(options?.includeDrafts ?? false);

  const data = readDemoStore();
  if (!options?.includeDrafts) return filterPublished(data);
  return data;
}

export async function getEntity(entity: EntityName, includeDrafts = true): Promise<unknown[]> {
  assertDataStoreAvailable();
  if (databaseConfigured) return (await getDatabaseEntity(entity, includeDrafts)) || [];
  const records = readDemoStore()[entity] as unknown[];
  if (!includeDrafts) return records.filter((item: unknown) => (item as { status?: string }).status === "PUBLISHED");
  return clone(records);
}

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
    const before = id ? (await getEntity(entity, true)).find((item) => (item as { id?: string }).id === id) : undefined;
    const saved = await upsertDatabaseEntity(entity, payload, id, actorId);
    await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: id ? "UPDATED" : "CREATED", entity, entityId: String((saved as { id: string }).id), before, after: saved });
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
    publishedAt: nextStatus === "PUBLISHED" ? (previous?.publishedAt || now) : previous?.publishedAt,
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
    const before = (await getEntity(entity, true)).find((item) => (item as { id?: string }).id === id);
    await deleteDatabaseEntity(entity, id);
    await appendAudit({ user: actor, userId: actorId, role, ipAddress, action: "DELETED", entity, entityId: id, before });
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

export async function getAuditEntries() {
  assertDataStoreAvailable();
  if (databaseConfigured) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is required in production.");
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } } } });
    return logs.map((log) => ({ ...log, user: log.user?.name || log.user?.email || log.userId || "system" }));
  }
  return clone(readAuditEntries()).reverse();
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
  await prisma.auditLog.create({
    data: {
      userId: audit.userId,
      role: audit.role as any,
      action: audit.action,
      entity: audit.entity,
      entityId: audit.entityId,
      ipAddress: audit.ipAddress,
      beforeJson: audit.before ? JSON.stringify(audit.before) : undefined,
      afterJson: audit.after ? JSON.stringify(audit.after) : undefined,
    },
  });
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

async function getDatabaseData(includeDrafts: boolean): Promise<SiteData> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required for database content.");
  const where = includeDrafts ? {} : { status: "PUBLISHED" as const };
  const [departments, programs, faculty, laboratories, researchAreas, projects, publications, achievements, events, organizations, pages, links, contacts, settings, media, documents] = await Promise.all([
    prisma.department.findMany({ where, orderBy: { name: "asc" } }),
    prisma.program.findMany({ where, include: { department: true, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } }),
    prisma.facultyMember.findMany({ where, include: { department: true, researchAreas: { include: { researchArea: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { name: "asc" } }),
    prisma.laboratory.findMany({ where, include: { department: true }, orderBy: { name: "asc" } }),
    prisma.researchArea.findMany({ where, include: { faculty: { include: { faculty: true } }, departments: { include: { department: true } } }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where, include: { department: true, faculty: { include: { faculty: true } }, laboratories: { include: { laboratory: true } } }, orderBy: { title: "asc" } }),
    prisma.publication.findMany({ where, include: { department: true, authors: { include: { faculty: true } } }, orderBy: { year: "desc" } }),
    prisma.achievement.findMany({ where, include: { department: true }, orderBy: { year: "desc" } }),
    prisma.event.findMany({ where, include: { department: true }, orderBy: { startsAt: "asc" } }),
    prisma.studentOrganization.findMany({ where, include: { department: true }, orderBy: { name: "asc" } }),
    prisma.page.findMany({ where, orderBy: { title: "asc" } }),
    prisma.link.findMany({ where, orderBy: { order: "asc" } }),
    prisma.contact.findMany({ where, orderBy: { label: "asc" } }),
    prisma.siteSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.media.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.document.findMany({ where, include: { department: true }, orderBy: { title: "asc" } }),
  ]);

  return {
    departments: departments as unknown as Department[],
    faculty: faculty.map((item) => ({
      ...item,
      departmentSlug: item.department?.slug,
      departmentName: item.department?.name,
      researchInterests: item.researchAreas.length ? item.researchAreas.map((area) => area.researchArea.name) : (item.researchInterests ? item.researchInterests.split("\n").filter(Boolean) : []),
      researchAreaSlugs: item.researchAreas.map((area) => area.researchArea.slug),
      laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug),
    })) as unknown as FacultyMember[],
    laboratories: laboratories.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name })) as unknown as Laboratory[],
    researchAreas: researchAreas.map((item) => ({
      ...item,
      facultySlugs: item.faculty.map((join) => join.faculty.slug),
      departmentSlugs: item.departments.map((join) => join.department.slug),
    })) as unknown as ResearchArea[],
    programs: programs.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug) })) as unknown as Program[],
    projects: projects.map((item) => ({
      ...item,
      departmentSlug: item.department?.slug,
      departmentName: item.department?.name,
      facultySlugs: item.faculty.map((join) => join.faculty.slug),
      laboratorySlugs: item.laboratories.map((join) => join.laboratory.slug),
    })) as unknown as Project[],
    publications: publications.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name, authorSlugs: item.authors.map((author) => author.faculty.slug) })) as unknown as Publication[],
    achievements: achievements.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name })) as unknown as Achievement[],
    events: events.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name })) as unknown as EventItem[],
    organizations: organizations.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name })) as unknown as StudentOrganization[],
    pages: pages as unknown as PageRecord[],
    links: links as unknown as LinkRecord[],
    contacts: contacts as unknown as ContactRecord[],
    settings: settings as unknown as SiteSetting[],
    media: media as unknown as MediaRecord[],
    documents: documents.map((item) => ({ ...item, departmentSlug: item.department?.slug, departmentName: item.department?.name })) as unknown as DocumentRecord[],
  };
}

async function getDatabaseEntity(entity: EntityName, includeDrafts: boolean): Promise<unknown[] | null> {
  const data = await getDatabaseData(includeDrafts);
  return data[entity] as unknown[];
}

async function upsertDatabaseEntity(entity: EntityName, payload: Record<string, unknown>, id?: string, actorId?: string) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is not configured");
  const data = await normalizeDatabasePayload(entity, payload, id, actorId);
  const where = id ? { id } : undefined;
  let saved: { id: string };
  switch (entity) {
    case "departments": saved = (id ? await prisma.department.update({ where: where!, data: data as never }) : await prisma.department.create({ data: data as never })); break;
    case "programs": saved = (id ? await prisma.program.update({ where: where!, data: data as never }) : await prisma.program.create({ data: data as never })); break;
    case "faculty": saved = (id ? await prisma.facultyMember.update({ where: where!, data: data as never }) : await prisma.facultyMember.create({ data: data as never })); break;
    case "laboratories": saved = (id ? await prisma.laboratory.update({ where: where!, data: data as never }) : await prisma.laboratory.create({ data: data as never })); break;
    case "researchAreas": saved = (id ? await prisma.researchArea.update({ where: where!, data: data as never }) : await prisma.researchArea.create({ data: data as never })); break;
    case "projects": saved = (id ? await prisma.project.update({ where: where!, data: data as never }) : await prisma.project.create({ data: data as never })); break;
    case "publications": saved = (id ? await prisma.publication.update({ where: where!, data: data as never }) : await prisma.publication.create({ data: data as never })); break;
    case "achievements": saved = (id ? await prisma.achievement.update({ where: where!, data: data as never }) : await prisma.achievement.create({ data: data as never })); break;
    case "events": saved = (id ? await prisma.event.update({ where: where!, data: data as never }) : await prisma.event.create({ data: data as never })); break;
    case "organizations": saved = (id ? await prisma.studentOrganization.update({ where: where!, data: data as never }) : await prisma.studentOrganization.create({ data: data as never })); break;
    case "pages": saved = (id ? await prisma.page.update({ where: where!, data: data as never }) : await prisma.page.create({ data: data as never })); break;
    case "links": saved = (id ? await prisma.link.update({ where: where!, data: data as never }) : await prisma.link.create({ data: data as never })); break;
    case "contacts": saved = (id ? await prisma.contact.update({ where: where!, data: data as never }) : await prisma.contact.create({ data: data as never })); break;
    case "settings": saved = (id ? await prisma.siteSetting.update({ where: where!, data: data as never }) : await prisma.siteSetting.create({ data: data as never })); break;
    case "media": saved = (id ? await prisma.media.update({ where: where!, data: data as never }) : await prisma.media.create({ data: data as never })); break;
    case "documents": saved = (id ? await prisma.document.update({ where: where!, data: data as never }) : await prisma.document.create({ data: data as never })); break;
    default: throw new Error("Unsupported entity");
  }
  await syncRelationships(entity, saved.id, payload, prisma);
  return saved;
}

async function deleteDatabaseEntity(entity: EntityName, id: string) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database is not configured");
  switch (entity) {
    case "departments": return prisma.department.delete({ where: { id } });
    case "programs": return prisma.program.delete({ where: { id } });
    case "faculty": return prisma.facultyMember.delete({ where: { id } });
    case "laboratories": return prisma.laboratory.delete({ where: { id } });
    case "researchAreas": return prisma.researchArea.delete({ where: { id } });
    case "projects": return prisma.project.delete({ where: { id } });
    case "publications": return prisma.publication.delete({ where: { id } });
    case "achievements": return prisma.achievement.delete({ where: { id } });
    case "events": return prisma.event.delete({ where: { id } });
    case "organizations": return prisma.studentOrganization.delete({ where: { id } });
    case "pages": return prisma.page.delete({ where: { id } });
    case "links": return prisma.link.delete({ where: { id } });
    case "contacts": return prisma.contact.delete({ where: { id } });
    case "settings": return prisma.siteSetting.delete({ where: { id } });
    case "media": return prisma.media.delete({ where: { id } });
    case "documents": return prisma.document.delete({ where: { id } });
    default: throw new Error("Unsupported entity");
  }
}

function relationValues(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

async function syncRelationships(entity: EntityName, id: string, payload: Record<string, unknown>, prisma: PrismaClient) {
  const resolveFaculty = async (values: string[]) => prisma.facultyMember.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveLaboratories = async (values: string[]) => prisma.laboratory.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveResearchAreas = async (values: string[]) => prisma.researchArea.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });
  const resolveDepartments = async (values: string[]) => prisma.department.findMany({ where: { OR: [{ slug: { in: values } }, { id: { in: values } }] }, select: { id: true } });

  if (entity === "programs" && payload.laboratorySlugs !== undefined) {
    const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
    await prisma.programLaboratory.deleteMany({ where: { programId: id } });
    if (values.length) await prisma.programLaboratory.createMany({ data: values.map((item) => ({ programId: id, laboratoryId: item.id })), skipDuplicates: true });
  }
  if (entity === "faculty") {
    if (payload.researchAreaSlugs !== undefined) {
      const values = await resolveResearchAreas(relationValues(payload.researchAreaSlugs));
      await prisma.facultyResearchArea.deleteMany({ where: { facultyId: id } });
      if (values.length) await prisma.facultyResearchArea.createMany({ data: values.map((item) => ({ facultyId: id, researchAreaId: item.id })), skipDuplicates: true });
    }
    if (payload.laboratorySlugs !== undefined) {
      const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
      await prisma.facultyLaboratory.deleteMany({ where: { facultyId: id } });
      if (values.length) await prisma.facultyLaboratory.createMany({ data: values.map((item) => ({ facultyId: id, laboratoryId: item.id })), skipDuplicates: true });
    }
  }
  if (entity === "researchAreas") {
    if (payload.facultySlugs !== undefined) {
      const values = await resolveFaculty(relationValues(payload.facultySlugs));
      await prisma.facultyResearchArea.deleteMany({ where: { researchAreaId: id } });
      if (values.length) await prisma.facultyResearchArea.createMany({ data: values.map((item) => ({ facultyId: item.id, researchAreaId: id })), skipDuplicates: true });
    }
    if (payload.departmentSlugs !== undefined) {
      const values = await resolveDepartments(relationValues(payload.departmentSlugs));
      await prisma.departmentResearchArea.deleteMany({ where: { researchAreaId: id } });
      if (values.length) await prisma.departmentResearchArea.createMany({ data: values.map((item) => ({ departmentId: item.id, researchAreaId: id })), skipDuplicates: true });
    }
  }
  if (entity === "projects") {
    if (payload.facultySlugs !== undefined) {
      const values = await resolveFaculty(relationValues(payload.facultySlugs));
      await prisma.projectFaculty.deleteMany({ where: { projectId: id } });
      if (values.length) await prisma.projectFaculty.createMany({ data: values.map((item) => ({ projectId: id, facultyId: item.id })), skipDuplicates: true });
    }
    if (payload.laboratorySlugs !== undefined) {
      const values = await resolveLaboratories(relationValues(payload.laboratorySlugs));
      await prisma.projectLaboratory.deleteMany({ where: { projectId: id } });
      if (values.length) await prisma.projectLaboratory.createMany({ data: values.map((item) => ({ projectId: id, laboratoryId: item.id })), skipDuplicates: true });
    }
  }
  if (entity === "publications" && payload.authorSlugs !== undefined) {
    const values = await resolveFaculty(relationValues(payload.authorSlugs));
    await prisma.publicationFaculty.deleteMany({ where: { publicationId: id } });
    if (values.length) await prisma.publicationFaculty.createMany({ data: values.map((item) => ({ publicationId: id, facultyId: item.id })), skipDuplicates: true });
  }
}

async function normalizeDatabasePayload(entity: EntityName, payload: Record<string, unknown>, id?: string, actorId?: string) {
  const omit = new Set(["id", "createdAt", "updatedAt", "publishedAt", "departmentName", "departmentSlug", "status", "authorSlugs", "facultySlugs", "laboratorySlugs", "researchAreaSlugs", "departmentSlugs"]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!omit.has(key) && value !== undefined) data[key] = value;
  }
  if (payload.status !== undefined) {
    data.status = payload.status;
    data.publishedAt = payload.status === "PUBLISHED" ? (payload.publishedAt || new Date()) : null;
  } else if (!id && entity !== "settings" && entity !== "media") {
    data.status = "DRAFT";
  }
  if (payload.publishedAt) data.publishedAt = payload.publishedAt;
  if (entity === "programs" && payload.approvedSeats !== undefined && payload.approvedSeats !== "") data.approvedSeats = Number(payload.approvedSeats);
  if (["achievements", "publications"].includes(entity) && payload.year !== undefined && payload.year !== "") data.year = Number(payload.year);
  if (["media", "documents"].includes(entity) && payload.sizeBytes !== undefined && payload.sizeBytes !== "") data.sizeBytes = Number(payload.sizeBytes);
  if (entity === "faculty" && Array.isArray(payload.researchInterests)) data.researchInterests = payload.researchInterests.map(String).join("\\n");
  if (entity === "events") {
    if (payload.startsAt) data.startsAt = new Date(String(payload.startsAt));
    else if (payload.startsAt === "") data.startsAt = null;
    if (payload.endsAt) data.endsAt = new Date(String(payload.endsAt));
    else if (payload.endsAt === "") data.endsAt = null;
  }
  if (entity === "publications" && !data.slug && payload.title) data.slug = slugify(String(payload.title));
  if (payload.departmentSlug && ["programs", "faculty", "laboratories", "projects", "publications", "achievements", "events", "organizations", "documents"].includes(entity)) {
    const prisma = getPrisma();
    if (prisma) {
      const department = await prisma.department.findUnique({ where: { slug: String(payload.departmentSlug) }, select: { id: true } });
      data.departmentId = department?.id;
    }
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
    return prisma.$queryRaw<SearchRecord[]>`
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
      SELECT id, 'Research area', name, description, '/research#' || slug, "sourceNote"
      FROM "ResearchArea" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', name, description, "sourceNote")) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Project', title, summary, '/research', sponsor
      FROM "Project" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, sponsor)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Publication', title, coalesce(abstract, venue, ''), '/research', venue
      FROM "Publication" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, abstract, venue, doi)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Event', title, summary, '/events', location
      FROM "Event" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, summary, location)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Achievement', title, description, '/achievements', category
      FROM "Achievement" WHERE status = 'PUBLISHED' AND to_tsvector('simple', concat_ws(' ', title, description, category, recipient)) @@ websearch_to_tsquery('simple', ${normalized})
      UNION ALL
      SELECT id, 'Page', title, coalesce(excerpt, body), '/' || slug, locale
      FROM "Page" WHERE status = 'PUBLISHED' AND locale = 'en' AND to_tsvector('simple', concat_ws(' ', title, excerpt, body)) @@ websearch_to_tsquery('simple', ${normalized})
      LIMIT 100
    `;
  }
  const data = await getSiteData();
  const records: SearchRecord[] = [
    ...data.pages.map((item) => ({ id: item.id, type: "Page", title: item.title, description: item.excerpt || item.body, href: `/${item.slug}` })),
    ...data.departments.map((item) => ({ id: item.id, type: "Department", title: item.name, description: item.overview, href: `/departments/${item.slug}`, meta: item.shortName })),
    ...data.programs.map((item) => ({ id: item.id, type: "Programme", title: item.title, description: item.summary, href: `/programs/${item.slug}`, meta: item.departmentName })),
    ...data.faculty.map((item) => ({ id: item.id, type: "Faculty", title: item.name, description: `${item.designation}. ${item.profile || ""}`, href: `/faculty/${item.slug}`, meta: item.departmentName })),
    ...data.laboratories.map((item) => ({ id: item.id, type: "Laboratory", title: item.name, description: item.description, href: `/laboratories/${item.slug}`, meta: item.departmentName })),
    ...data.researchAreas.map((item) => ({ id: item.id, type: "Research area", title: item.name, description: item.description, href: `/research#${item.slug}`, meta: item.sourceNote })),
    ...data.projects.map((item) => ({ id: item.id, type: "Project", title: item.title, description: item.summary, href: "/research" })),
    ...data.publications.map((item) => ({ id: item.id, type: "Publication", title: item.title, description: item.abstract || "Approved publication record", href: "/research" })),
    ...data.events.map((item) => ({ id: item.id, type: "Event", title: item.title, description: item.summary, href: "/events" })),
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

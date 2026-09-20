/**
 * Production content bootstrap: import the curated IET-DSMNRU content from
 * data/seed.ts into an EXISTING database through DATABASE_URL.
 *
 * Safety properties:
 * - NOT an HTTP/API endpoint; runs only as this explicit operator command.
 * - Requires the confirmation flag BOOTSTRAP_CONTENT_I_UNDERSTAND=yes.
 * - NEVER touches User records. The bootstrapped SUPER_ADMIN account and every
 *   other account are neither read nor modified (the User model is not used).
 * - NEVER runs migrations, `prisma db push`, deleteMany/delete cascades or
 *   resets. The only write primitive is upsert, plus reads for verification.
 * - Idempotent: every record is upserted by the stable ID assigned in
 *   data/seed.ts, so re-running converges the database to the curated content
 *   without duplicating anything.
 * - Preserves the ContentStatus of every record exactly as curated in
 *   data/seed.ts. DRAFT/REVIEW records stay DRAFT/REVIEW and are never
 *   converted to PUBLISHED. publishedAt is kept for records that are already
 *   published; records that are not PUBLISHED never carry a publishedAt.
 * - Records created later through the CMS (different IDs) are never modified
 *   or removed, and relationships added through the CMS are never removed.
 *   NOTE: records that already exist under a seed ID are converged to the
 *   curated seed values (including status); editorial changes made through the
 *   CMS to those specific records are reverted on re-run.
 * - Runs inside a single transaction: either the whole curated content set is
 *   imported or nothing is written at all.
 * - Aborts before writing anything when the database already contains a record
 *   with the same unique slug (or setting key, or page slug+locale) under a
 *   different ID, so independently created records are never overwritten.
 * - Imports only the curated content entities; media and documents are not
 *   bootstrapped (data/seed.ts contains none, and binary objects live in
 *   object storage, not in the repository).
 *
 * Usage (see the header of scripts/bootstrap-admin.ts for the account
 * bootstrap that must run first):
 *   DATABASE_URL="<production database url>" \
 *   BOOTSTRAP_CONTENT_I_UNDERSTAND=yes \
 *   npm run db:bootstrap-content
 */
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { seedData } from "../data/seed";

const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

type Row = Record<string, unknown>;
type Outcome = "created" | "updated" | "unchanged";
type EntityStats = { created: number; updated: number; unchanged: number };
type TransactionClient = Prisma.TransactionClient;

const runAt = new Date();
const stats = new Map<string, EntityStats>();

function track(label: string, outcome: Outcome): void {
  const entry = stats.get(label) ?? { created: 0, updated: 0, unchanged: 0 };
  entry[outcome] += 1;
  stats.set(label, entry);
}

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    // Never log the credentials part of DATABASE_URL.
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "<unparsable DATABASE_URL>";
  }
}

function requireConfirmation(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  if (process.env.BOOTSTRAP_CONTENT_I_UNDERSTAND !== "yes") {
    throw new Error(
      "Refusing to run: this script upserts the curated content from data/seed.ts into the database that DATABASE_URL points at. Read scripts/bootstrap-content.ts, confirm DATABASE_URL targets the intended database, then set BOOTSTRAP_CONTENT_I_UNDERSTAND=yes.",
    );
  }
  return databaseUrl;
}

// ---------------------------------------------------------------------------
// Seed validation (pure, runs before the database is touched at all)
// ---------------------------------------------------------------------------

function collectDuplicateIds(label: string, items: ReadonlyArray<{ id: string }>, errors: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id) errors.push(`${label}: record without an id.`);
    else if (seen.has(item.id)) errors.push(`${label}: duplicate id "${item.id}".`);
    else seen.add(item.id);
  }
}

function collectDuplicateKeys<T extends { id: string }>(
  label: string,
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
  errors: string[],
): void {
  const seen = new Map<string, string>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    if (seen.has(key)) errors.push(`${label}: duplicate key "${key}" (also used by id "${seen.get(key)}").`);
    else seen.set(key, item.id);
  }
}

function validateSeedData(): void {
  const errors: string[] = [];

  const idCollections: Array<[string, ReadonlyArray<{ id: string }>]> = [
    ["departments", seedData.departments],
    ["programs", seedData.programs],
    ["faculty", seedData.faculty],
    ["laboratories", seedData.laboratories],
    ["researchAreas", seedData.researchAreas],
    ["projects", seedData.projects],
    ["publications", seedData.publications],
    ["achievements", seedData.achievements],
    ["events", seedData.events],
    ["organizations", seedData.organizations],
    ["pages", seedData.pages],
    ["links", seedData.links],
    ["contacts", seedData.contacts],
    ["settings", seedData.settings],
  ];
  for (const [label, items] of idCollections) collectDuplicateIds(label, items, errors);

  collectDuplicateKeys("departments", seedData.departments, (item) => item.slug, errors);
  collectDuplicateKeys("programs", seedData.programs, (item) => item.slug, errors);
  collectDuplicateKeys("faculty", seedData.faculty, (item) => item.slug, errors);
  collectDuplicateKeys("laboratories", seedData.laboratories, (item) => item.slug, errors);
  collectDuplicateKeys("researchAreas", seedData.researchAreas, (item) => item.slug, errors);
  collectDuplicateKeys("projects", seedData.projects, (item) => item.slug, errors);
  collectDuplicateKeys("publications", seedData.publications, (item) => item.slug, errors);
  collectDuplicateKeys("events", seedData.events, (item) => item.slug, errors);
  collectDuplicateKeys("organizations", seedData.organizations, (item) => item.slug, errors);
  collectDuplicateKeys("pages", seedData.pages, (item) => `${item.slug}::${item.locale}`, errors);
  collectDuplicateKeys("settings", seedData.settings, (item) => item.key, errors);

  const departmentSlugs = new Set(seedData.departments.map((item) => item.slug));
  const facultySlugs = new Set(seedData.faculty.map((item) => item.slug));
  const laboratorySlugs = new Set(seedData.laboratories.map((item) => item.slug));
  const researchAreaSlugs = new Set(seedData.researchAreas.map((item) => item.slug));

  const checkReference = (owner: string, slug: string, target: string, known: Set<string>): void => {
    if (!known.has(slug)) errors.push(`${owner}: unknown ${target} slug "${slug}".`);
  };

  for (const item of seedData.programs) {
    if (item.departmentSlug) checkReference(`program "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
    for (const slug of item.laboratorySlugs ?? []) checkReference(`program "${item.slug}"`, slug, "laboratory", laboratorySlugs);
  }
  for (const item of seedData.faculty) {
    if (item.departmentSlug) checkReference(`faculty "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
    for (const slug of item.researchAreaSlugs ?? []) checkReference(`faculty "${item.slug}"`, slug, "research area", researchAreaSlugs);
    for (const slug of item.laboratorySlugs ?? []) checkReference(`faculty "${item.slug}"`, slug, "laboratory", laboratorySlugs);
  }
  for (const item of seedData.laboratories) {
    if (item.departmentSlug) checkReference(`laboratory "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
  }
  for (const item of seedData.researchAreas) {
    for (const slug of item.facultySlugs ?? []) checkReference(`research area "${item.slug}"`, slug, "faculty", facultySlugs);
    for (const slug of item.departmentSlugs ?? []) checkReference(`research area "${item.slug}"`, slug, "department", departmentSlugs);
  }
  for (const item of seedData.projects) {
    if (item.departmentSlug) checkReference(`project "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
    for (const slug of item.facultySlugs ?? []) checkReference(`project "${item.slug}"`, slug, "faculty", facultySlugs);
    for (const slug of item.laboratorySlugs ?? []) checkReference(`project "${item.slug}"`, slug, "laboratory", laboratorySlugs);
  }
  for (const item of seedData.publications) {
    if (item.departmentSlug) checkReference(`publication "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
    for (const slug of item.authorSlugs ?? []) checkReference(`publication "${item.slug}"`, slug, "faculty", facultySlugs);
  }
  for (const item of seedData.achievements) {
    if (item.departmentSlug) checkReference(`achievement "${item.title}"`, item.departmentSlug, "department", departmentSlugs);
  }
  for (const item of seedData.events) {
    if (item.departmentSlug) checkReference(`event "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
  }
  for (const item of seedData.organizations) {
    if (item.departmentSlug) checkReference(`student organization "${item.slug}"`, item.departmentSlug, "department", departmentSlugs);
  }

  if (errors.length > 0) {
    throw new Error(`data/seed.ts failed validation:\n  - ${errors.join("\n  - ")}`);
  }
}

// ---------------------------------------------------------------------------
// Change detection (keeps re-runs side-effect free for in-sync records)
// ---------------------------------------------------------------------------

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function changedKeys(payload: Row, existing: Row | undefined): string[] {
  const managed = Object.keys(payload).filter((key) => payload[key] !== undefined);
  if (!existing) return managed;
  return managed.filter((key) => !sameValue(payload[key], existing[key]));
}

function pickChanged<P extends object>(payload: P, keys: readonly string[]): Partial<P> {
  const source = payload as Row;
  const picked: Row = {};
  for (const key of keys) picked[key] = source[key];
  return picked as Partial<P>;
}

/** publishedAt is preserved for already-published records and never set on unpublished ones. */
function publishedAtFor(status: string, existing: Row | undefined): Date | null {
  if (status !== "PUBLISHED") return null;
  const current = existing?.publishedAt;
  return current instanceof Date ? current : runAt;
}

function toDateOrNull(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value instanceof Date ? value : new Date(value);
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

async function syncEntity<T extends { id: string }, P extends object>(
  label: string,
  items: readonly T[],
  existingById: ReadonlyMap<string, Row>,
  buildPayload: (item: T, existing: Row | undefined) => P,
  write: (id: string, createData: P, updateData: Partial<P>) => Promise<unknown>,
): Promise<void> {
  for (const item of items) {
    const existing = existingById.get(item.id);
    const payload = buildPayload(item, existing);
    const changes = changedKeys(payload as unknown as Row, existing);
    if (existing && changes.length === 0) {
      track(label, "unchanged");
      continue;
    }
    await write(item.id, Object.assign({}, payload, { id: item.id }), pickChanged(payload, changes));
    track(label, existing ? "updated" : "created");
  }
}

/**
 * Abort when the database already holds a record under the same natural key
 * (slug, setting key, page slug+locale) but a different ID. Such records were
 * created independently (e.g. through the CMS) and are never overwritten.
 */
function assertNoNaturalKeyConflicts(
  entityLabel: string,
  keyLabel: string,
  expectedIdByKey: ReadonlyMap<string, string>,
  rows: ReadonlyArray<{ id: string; key: string | undefined }>,
): void {
  const conflicts = rows
    .filter((row) => row.key !== undefined && expectedIdByKey.get(row.key) !== undefined && expectedIdByKey.get(row.key) !== row.id)
    .map((row) => `${entityLabel} with ${keyLabel} "${row.key}" already exists under id "${row.id}" (data/seed.ts expects id "${expectedIdByKey.get(row.key as string)}")`);
  if (conflicts.length > 0) {
    throw new Error(
      `Bootstrap aborted before writing anything: ${conflicts.length} existing record(s) collide with data/seed.ts.\n  - ${conflicts.join("\n  - ")}\nReview those records through the CMS and re-run. This script never overwrites records it does not own.`,
    );
  }
}

function byIdMap(rows: ReadonlyArray<{ id: string }>, seedIds: ReadonlySet<string>): Map<string, Row> {
  return new Map(
    rows.filter((row) => seedIds.has(row.id)).map((row) => [row.id, row as unknown as Row]),
  );
}

const pairKey = (a: string, b: string): string => `${a}||${b}`;

async function syncJoinPairs(
  label: string,
  existingPairs: ReadonlySet<string>,
  desiredPairs: ReadonlyArray<readonly [string, string]>,
  write: (leftId: string, rightId: string) => Promise<unknown>,
): Promise<void> {
  for (const [leftId, rightId] of desiredPairs) {
    if (existingPairs.has(pairKey(leftId, rightId))) {
      track(label, "unchanged");
      continue;
    }
    await write(leftId, rightId);
    track(label, "created");
  }
}

function requireIdBySlug(map: ReadonlyMap<string, string>, slug: string, entityLabel: string): string {
  const id = map.get(slug);
  if (!id) throw new Error(`Unknown ${entityLabel} slug "${slug}".`);
  return id;
}

// ---------------------------------------------------------------------------
// Content import (single transaction)
// ---------------------------------------------------------------------------

async function importContent(tx: TransactionClient): Promise<void> {
  // --- Phase 1: read existing rows and refuse to overwrite foreign records ---

  const departmentIds = new Set(seedData.departments.map((item) => item.id));
  const programIds = new Set(seedData.programs.map((item) => item.id));
  const facultyIds = new Set(seedData.faculty.map((item) => item.id));
  const laboratoryIds = new Set(seedData.laboratories.map((item) => item.id));
  const researchAreaIds = new Set(seedData.researchAreas.map((item) => item.id));
  const projectIds = new Set(seedData.projects.map((item) => item.id));
  const publicationIds = new Set(seedData.publications.map((item) => item.id));
  const achievementIds = new Set(seedData.achievements.map((item) => item.id));
  const eventIds = new Set(seedData.events.map((item) => item.id));
  const organizationIds = new Set(seedData.organizations.map((item) => item.id));
  const pageIds = new Set(seedData.pages.map((item) => item.id));
  const linkIds = new Set(seedData.links.map((item) => item.id));
  const contactIds = new Set(seedData.contacts.map((item) => item.id));
  const settingIds = new Set(seedData.settings.map((item) => item.id));

  const slugIndex = (items: ReadonlyArray<{ slug: string; id: string }>): Map<string, string> =>
    new Map(items.map((item) => [item.slug, item.id]));

  const departmentRows = await tx.department.findMany({
    where: { OR: [{ id: { in: [...departmentIds] } }, { slug: { in: seedData.departments.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Department", "slug", slugIndex(seedData.departments), departmentRows.map((row) => ({ id: row.id, key: row.slug })));

  const programRows = await tx.program.findMany({
    where: { OR: [{ id: { in: [...programIds] } }, { slug: { in: seedData.programs.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Program", "slug", slugIndex(seedData.programs), programRows.map((row) => ({ id: row.id, key: row.slug })));

  const facultyRows = await tx.facultyMember.findMany({
    where: { OR: [{ id: { in: [...facultyIds] } }, { slug: { in: seedData.faculty.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Faculty member", "slug", slugIndex(seedData.faculty), facultyRows.map((row) => ({ id: row.id, key: row.slug })));

  const laboratoryRows = await tx.laboratory.findMany({
    where: { OR: [{ id: { in: [...laboratoryIds] } }, { slug: { in: seedData.laboratories.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Laboratory", "slug", slugIndex(seedData.laboratories), laboratoryRows.map((row) => ({ id: row.id, key: row.slug })));

  const researchAreaRows = await tx.researchArea.findMany({
    where: { OR: [{ id: { in: [...researchAreaIds] } }, { slug: { in: seedData.researchAreas.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Research area", "slug", slugIndex(seedData.researchAreas), researchAreaRows.map((row) => ({ id: row.id, key: row.slug })));

  const projectRows = await tx.project.findMany({
    where: { OR: [{ id: { in: [...projectIds] } }, { slug: { in: seedData.projects.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Project", "slug", slugIndex(seedData.projects), projectRows.map((row) => ({ id: row.id, key: row.slug })));

  const publicationRows = await tx.publication.findMany({
    where: { OR: [{ id: { in: [...publicationIds] } }, { slug: { in: seedData.publications.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Publication", "slug", slugIndex(seedData.publications), publicationRows.map((row) => ({ id: row.id, key: row.slug })));

  const eventRows = await tx.event.findMany({
    where: { OR: [{ id: { in: [...eventIds] } }, { slug: { in: seedData.events.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Event", "slug", slugIndex(seedData.events), eventRows.map((row) => ({ id: row.id, key: row.slug })));

  const organizationRows = await tx.studentOrganization.findMany({
    where: { OR: [{ id: { in: [...organizationIds] } }, { slug: { in: seedData.organizations.map((item) => item.slug) } }] },
  });
  assertNoNaturalKeyConflicts("Student organization", "slug", slugIndex(seedData.organizations), organizationRows.map((row) => ({ id: row.id, key: row.slug })));

  const pageRows = await tx.page.findMany({
    where: { OR: [{ id: { in: [...pageIds] } }, { AND: [{ slug: { in: seedData.pages.map((item) => item.slug) } }, { locale: { in: [...new Set(seedData.pages.map((item) => item.locale))] } }] }] },
  });
  assertNoNaturalKeyConflicts(
    "Page",
    "slug+locale",
    new Map(seedData.pages.map((item) => [`${item.slug}::${item.locale}`, item.id])),
    pageRows.map((row) => ({ id: row.id, key: `${row.slug}::${row.locale}` })),
  );

  const settingRows = await tx.siteSetting.findMany({
    where: { OR: [{ id: { in: [...settingIds] } }, { key: { in: seedData.settings.map((item) => item.key) } }] },
  });
  assertNoNaturalKeyConflicts("Site setting", "key", new Map(seedData.settings.map((item) => [item.key, item.id])), settingRows.map((row) => ({ id: row.id, key: row.key })));

  const achievementRows = await tx.achievement.findMany({ where: { id: { in: [...achievementIds] } } });
  const linkRows = await tx.link.findMany({ where: { id: { in: [...linkIds] } } });
  const contactRows = await tx.contact.findMany({ where: { id: { in: [...contactIds] } } });

  // --- Phase 2: upsert every curated record by its stable seed ID ---

  const departmentIdBySlug = new Map(seedData.departments.map((item) => [item.slug, item.id]));
  const departmentIdFor = (slug: string | undefined): string | undefined =>
    slug === undefined ? undefined : requireIdBySlug(departmentIdBySlug, slug, "department");

  await syncEntity("departments", seedData.departments, byIdMap(departmentRows, departmentIds),
    (item, existing): Prisma.DepartmentUncheckedCreateInput => ({
      slug: item.slug,
      name: item.name,
      shortName: item.shortName,
      overview: item.overview,
      established: item.established,
      sourceNote: item.sourceNote,
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.department.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("programs", seedData.programs, byIdMap(programRows, programIds),
    (item, existing): Prisma.ProgramUncheckedCreateInput => ({
      slug: item.slug,
      title: item.title,
      shortTitle: item.shortTitle,
      level: item.level,
      duration: item.duration,
      approvedSeats: item.approvedSeats,
      summary: item.summary,
      eligibility: item.eligibility,
      admissionNote: item.admissionNote,
      sourceNote: item.sourceNote,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.program.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("faculty", seedData.faculty, byIdMap(facultyRows, facultyIds),
    (item, existing): Prisma.FacultyMemberUncheckedCreateInput => ({
      slug: item.slug,
      name: item.name,
      designation: item.designation,
      email: item.email,
      phone: item.phone,
      qualification: item.qualification,
      profile: item.profile,
      researchInterests: item.researchInterests?.join("\n"),
      departmentId: departmentIdFor(item.departmentSlug),
      type: item.type,
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.facultyMember.upsert({ where: { id }, create: createData, update: updateData }));

  // Configured department contacts: curated editorial decisions, upserted on
  // the (department, faculty) unique key so re-running converges without
  // duplicates and without deleting anything an operator added later.
  const contactFacultyIds = new Map(seedData.faculty.map((item) => [item.slug, item.id]));
  for (const department of seedData.departments) {
    for (const contact of department.contacts || []) {
      const facultyId = contactFacultyIds.get(contact.facultySlug);
      if (!facultyId) throw new Error(`Curated department ${department.slug} references unknown faculty slug "${contact.facultySlug}".`);
      await tx.departmentContact.upsert({
        where: { departmentId_facultyId: { departmentId: department.id, facultyId } },
        update: { role: contact.role, order: contact.order ?? 0 },
        create: { departmentId: department.id, facultyId, role: contact.role, order: contact.order ?? 0 },
      });
    }
  }

  await syncEntity("laboratories", seedData.laboratories, byIdMap(laboratoryRows, laboratoryIds),
    (item, existing): Prisma.LaboratoryUncheckedCreateInput => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
      equipment: item.equipment,
      courses: item.courses,
      researchRelevance: item.researchRelevance,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.laboratory.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("researchAreas", seedData.researchAreas, byIdMap(researchAreaRows, researchAreaIds),
    (item, existing): Prisma.ResearchAreaUncheckedCreateInput => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
      sourceNote: item.sourceNote,
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.researchArea.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("projects", seedData.projects, byIdMap(projectRows, projectIds),
    (item, existing): Prisma.ProjectUncheckedCreateInput => ({
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      sponsor: item.sponsor,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.project.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("publications", seedData.publications, byIdMap(publicationRows, publicationIds),
    (item, existing): Prisma.PublicationUncheckedCreateInput => ({
      slug: item.slug,
      title: item.title,
      venue: item.venue,
      year: item.year,
      doi: item.doi,
      url: item.url,
      abstract: item.abstract,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.publication.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("achievements", seedData.achievements, byIdMap(achievementRows, achievementIds),
    (item, existing): Prisma.AchievementUncheckedCreateInput => ({
      title: item.title,
      category: item.category,
      description: item.description,
      recipient: item.recipient,
      year: item.year,
      eventName: item.eventName,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.achievement.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("events", seedData.events, byIdMap(eventRows, eventIds),
    (item, existing): Prisma.EventUncheckedCreateInput => ({
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      startsAt: toDateOrNull(item.startsAt),
      endsAt: toDateOrNull(item.endsAt),
      location: item.location,
      registrationUrl: item.registrationUrl,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.event.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("organizations", seedData.organizations, byIdMap(organizationRows, organizationIds),
    (item, existing): Prisma.StudentOrganizationUncheckedCreateInput => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
      contactUrl: item.contactUrl,
      departmentId: departmentIdFor(item.departmentSlug),
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.studentOrganization.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("pages", seedData.pages, byIdMap(pageRows, pageIds),
    (item, existing): Prisma.PageUncheckedCreateInput => ({
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      body: item.body,
      locale: item.locale,
      status: item.status,
      publishedAt: publishedAtFor(item.status, existing),
    }),
    (id, createData, updateData) => tx.page.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("links", seedData.links, byIdMap(linkRows, linkIds),
    (item): Prisma.LinkUncheckedCreateInput => ({
      label: item.label,
      url: item.url,
      description: item.description,
      owner: item.owner,
      order: item.order,
      status: item.status,
    }),
    (id, createData, updateData) => tx.link.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("contacts", seedData.contacts, byIdMap(contactRows, contactIds),
    (item): Prisma.ContactUncheckedCreateInput => ({
      label: item.label,
      name: item.name,
      email: item.email,
      phone: item.phone,
      address: item.address,
      category: item.category,
      status: item.status,
    }),
    (id, createData, updateData) => tx.contact.upsert({ where: { id }, create: createData, update: updateData }));

  await syncEntity("settings", seedData.settings, byIdMap(settingRows, settingIds),
    (item): Prisma.SiteSettingUncheckedCreateInput => ({
      key: item.key,
      value: item.value,
      description: item.description,
    }),
    (id, createData, updateData) => tx.siteSetting.upsert({ where: { id }, create: createData, update: updateData }));

  // --- Phase 3: relationships (additive only; CMS-created links are kept) ---
  //
  // data/seed.ts expresses the faculty/research-area relationship through
  // researchAreas[].facultySlugs (and, symmetrically, faculty[].researchAreaSlugs)
  // and the department/research-area relationship through
  // researchAreas[].departmentSlugs. The laboratory/author relationship fields
  // on programs, faculty, projects and publications are part of the seed
  // contract as well; the curated data currently does not populate them, so
  // those steps simply have nothing to create.

  const facultyIdBySlug = new Map(seedData.faculty.map((item) => [item.slug, item.id]));
  const laboratoryIdBySlug = new Map(seedData.laboratories.map((item) => [item.slug, item.id]));
  const researchAreaIdBySlug = new Map(seedData.researchAreas.map((item) => [item.slug, item.id]));

  const facultyAreaPairs = new Map<string, [string, string]>();
  for (const area of seedData.researchAreas) {
    for (const slug of area.facultySlugs ?? []) {
      facultyAreaPairs.set(pairKey(requireIdBySlug(facultyIdBySlug, slug, "faculty"), area.id), [requireIdBySlug(facultyIdBySlug, slug, "faculty"), area.id]);
    }
  }
  for (const member of seedData.faculty) {
    for (const slug of member.researchAreaSlugs ?? []) {
      facultyAreaPairs.set(pairKey(member.id, requireIdBySlug(researchAreaIdBySlug, slug, "research area")), [member.id, requireIdBySlug(researchAreaIdBySlug, slug, "research area")]);
    }
  }
  const departmentAreaPairs = new Map<string, [string, string]>();
  for (const area of seedData.researchAreas) {
    for (const slug of area.departmentSlugs ?? []) {
      departmentAreaPairs.set(pairKey(requireIdBySlug(departmentIdBySlug, slug, "department"), area.id), [requireIdBySlug(departmentIdBySlug, slug, "department"), area.id]);
    }
  }
  const programLaboratoryPairs = new Map<string, [string, string]>();
  for (const program of seedData.programs) {
    for (const slug of program.laboratorySlugs ?? []) {
      programLaboratoryPairs.set(pairKey(program.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")), [program.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")]);
    }
  }
  const facultyLaboratoryPairs = new Map<string, [string, string]>();
  for (const member of seedData.faculty) {
    for (const slug of member.laboratorySlugs ?? []) {
      facultyLaboratoryPairs.set(pairKey(member.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")), [member.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")]);
    }
  }
  const projectFacultyPairs = new Map<string, [string, string]>();
  for (const project of seedData.projects) {
    for (const slug of project.facultySlugs ?? []) {
      projectFacultyPairs.set(pairKey(project.id, requireIdBySlug(facultyIdBySlug, slug, "faculty")), [project.id, requireIdBySlug(facultyIdBySlug, slug, "faculty")]);
    }
  }
  const projectLaboratoryPairs = new Map<string, [string, string]>();
  for (const project of seedData.projects) {
    for (const slug of project.laboratorySlugs ?? []) {
      projectLaboratoryPairs.set(pairKey(project.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")), [project.id, requireIdBySlug(laboratoryIdBySlug, slug, "laboratory")]);
    }
  }
  const publicationAuthorPairs = new Map<string, [string, string]>();
  for (const publication of seedData.publications) {
    for (const slug of publication.authorSlugs ?? []) {
      publicationAuthorPairs.set(pairKey(publication.id, requireIdBySlug(facultyIdBySlug, slug, "faculty")), [publication.id, requireIdBySlug(facultyIdBySlug, slug, "faculty")]);
    }
  }

  const existingFacultyAreaPairs = new Set(
    (await tx.facultyResearchArea.findMany({ where: { researchAreaId: { in: [...researchAreaIds] } }, select: { facultyId: true, researchAreaId: true } }))
      .map((row) => pairKey(row.facultyId, row.researchAreaId)),
  );
  await syncJoinPairs("faculty/research-area relationships", existingFacultyAreaPairs, [...facultyAreaPairs.values()],
    (facultyId, researchAreaId) => tx.facultyResearchArea.upsert({
      where: { facultyId_researchAreaId: { facultyId, researchAreaId } },
      create: { facultyId, researchAreaId },
      update: { facultyId, researchAreaId },
    }));

  const existingDepartmentAreaPairs = new Set(
    (await tx.departmentResearchArea.findMany({ where: { researchAreaId: { in: [...researchAreaIds] } }, select: { departmentId: true, researchAreaId: true } }))
      .map((row) => pairKey(row.departmentId, row.researchAreaId)),
  );
  await syncJoinPairs("department/research-area relationships", existingDepartmentAreaPairs, [...departmentAreaPairs.values()],
    (departmentId, researchAreaId) => tx.departmentResearchArea.upsert({
      where: { departmentId_researchAreaId: { departmentId, researchAreaId } },
      create: { departmentId, researchAreaId },
      update: { departmentId, researchAreaId },
    }));

  if (programLaboratoryPairs.size > 0) {
    const existing = new Set(
      (await tx.programLaboratory.findMany({ where: { programId: { in: [...programIds] } }, select: { programId: true, laboratoryId: true } }))
        .map((row) => pairKey(row.programId, row.laboratoryId)),
    );
    await syncJoinPairs("program/laboratory relationships", existing, [...programLaboratoryPairs.values()],
      (programId, laboratoryId) => tx.programLaboratory.upsert({
        where: { programId_laboratoryId: { programId, laboratoryId } },
        create: { programId, laboratoryId },
        update: { programId, laboratoryId },
      }));
  }

  if (facultyLaboratoryPairs.size > 0) {
    const existing = new Set(
      (await tx.facultyLaboratory.findMany({ where: { facultyId: { in: [...facultyIds] } }, select: { facultyId: true, laboratoryId: true } }))
        .map((row) => pairKey(row.facultyId, row.laboratoryId)),
    );
    await syncJoinPairs("faculty/laboratory relationships", existing, [...facultyLaboratoryPairs.values()],
      (facultyId, laboratoryId) => tx.facultyLaboratory.upsert({
        where: { facultyId_laboratoryId: { facultyId, laboratoryId } },
        create: { facultyId, laboratoryId },
        update: { facultyId, laboratoryId },
      }));
  }

  if (projectFacultyPairs.size > 0 || projectLaboratoryPairs.size > 0) {
    const existingFaculty = new Set(
      (await tx.projectFaculty.findMany({ where: { projectId: { in: [...projectIds] } }, select: { projectId: true, facultyId: true } }))
        .map((row) => pairKey(row.projectId, row.facultyId)),
    );
    await syncJoinPairs("project/faculty relationships", existingFaculty, [...projectFacultyPairs.values()],
      (projectId, facultyId) => tx.projectFaculty.upsert({
        where: { projectId_facultyId: { projectId, facultyId } },
        create: { projectId, facultyId },
        update: { projectId, facultyId },
      }));
    const existingLaboratories = new Set(
      (await tx.projectLaboratory.findMany({ where: { projectId: { in: [...projectIds] } }, select: { projectId: true, laboratoryId: true } }))
        .map((row) => pairKey(row.projectId, row.laboratoryId)),
    );
    await syncJoinPairs("project/laboratory relationships", existingLaboratories, [...projectLaboratoryPairs.values()],
      (projectId, laboratoryId) => tx.projectLaboratory.upsert({
        where: { projectId_laboratoryId: { projectId, laboratoryId } },
        create: { projectId, laboratoryId },
        update: { projectId, laboratoryId },
      }));
  }

  if (publicationAuthorPairs.size > 0) {
    const existing = new Set(
      (await tx.publicationFaculty.findMany({ where: { publicationId: { in: [...publicationIds] } }, select: { publicationId: true, facultyId: true } }))
        .map((row) => pairKey(row.publicationId, row.facultyId)),
    );
    await syncJoinPairs("publication/author relationships", existing, [...publicationAuthorPairs.values()],
      (publicationId, facultyId) => tx.publicationFaculty.upsert({
        where: { publicationId_facultyId: { publicationId, facultyId } },
        create: { publicationId, facultyId },
        update: { publicationId, facultyId },
      }));
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function printReport(): void {
  console.log("IET-DSMNRU content bootstrap report");
  let records = 0;
  let relationships = 0;
  for (const [label, entry] of stats) {
    console.log(`  ${label}: ${entry.created} created, ${entry.updated} updated, ${entry.unchanged} already in sync`);
    if (label.includes("relationship")) relationships += entry.created + entry.updated + entry.unchanged;
    else records += entry.created + entry.updated + entry.unchanged;
  }
  console.log(`Curated content in place: ${records} records, ${relationships} relationships.`);
  console.log("No User records were read or modified. No migrations, deletions or resets were performed.");
}

async function main(): Promise<void> {
  const databaseUrl = requireConfirmation();
  validateSeedData();
  const recordCount =
    seedData.departments.length + seedData.programs.length + seedData.faculty.length +
    seedData.laboratories.length + seedData.researchAreas.length + seedData.projects.length +
    seedData.publications.length + seedData.achievements.length + seedData.events.length +
    seedData.organizations.length + seedData.pages.length + seedData.links.length +
    seedData.contacts.length + seedData.settings.length;
  console.log(`Importing ${recordCount} curated records from data/seed.ts into ${describeTarget(databaseUrl)}.`);
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => importContent(tx), {
      timeout: TRANSACTION_TIMEOUT_MS,
      maxWait: TRANSACTION_MAX_WAIT_MS,
    });
  } finally {
    await prisma.$disconnect();
  }
  printReport();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Content bootstrap failed.");
  console.error("No changes were committed: the import runs in a single transaction.");
  process.exit(1);
});

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { seedData } from "../data/seed";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, meetsPasswordPolicy } from "../lib/password-policy";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== "development" || process.env.ALLOW_LOCAL_SEED !== "true") {
    throw new Error("Seeding is development-only. Set NODE_ENV=development and ALLOW_LOCAL_SEED=true explicitly.");
  }
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !meetsPasswordPolicy(adminPassword)) {
    throw new Error(`Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD with ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters for local seeding.`);
  }
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({ where: { email: adminEmail }, update: { name: "IET Administrator", passwordHash: adminHash, role: "IET_ADMIN", active: true }, create: { email: adminEmail, name: "IET Administrator", passwordHash: adminHash, role: "IET_ADMIN" } });

  for (const item of seedData.departments) {
    await prisma.department.upsert({ where: { id: item.id }, update: { slug: item.slug, name: item.name, shortName: item.shortName, overview: item.overview, established: item.established, sourceNote: item.sourceNote, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, name: item.name, shortName: item.shortName, overview: item.overview, established: item.established, sourceNote: item.sourceNote, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  const departmentId = new Map(seedData.departments.map((item) => [item.slug, item.id]));
  for (const item of seedData.programs) {
    await prisma.program.upsert({ where: { id: item.id }, update: { slug: item.slug, title: item.title, shortTitle: item.shortTitle, level: item.level, duration: item.duration, approvedSeats: item.approvedSeats, summary: item.summary, eligibility: item.eligibility, admissionNote: item.admissionNote, sourceNote: item.sourceNote, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, title: item.title, shortTitle: item.shortTitle, level: item.level, duration: item.duration, approvedSeats: item.approvedSeats, summary: item.summary, eligibility: item.eligibility, admissionNote: item.admissionNote, sourceNote: item.sourceNote, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.faculty) {
    await prisma.facultyMember.upsert({ where: { id: item.id }, update: { slug: item.slug, name: item.name, designation: item.designation, email: item.email, phone: item.phone, qualification: item.qualification, profile: item.profile, researchInterests: item.researchInterests?.join("\n"), departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, type: item.type, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, name: item.name, designation: item.designation, email: item.email, phone: item.phone, qualification: item.qualification, profile: item.profile, researchInterests: item.researchInterests?.join("\n"), departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, type: item.type, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  // Department contacts are an explicit editorial configuration (never a
  // position in the faculty list): the curated seed declares, per department,
  // which person holds which responsibility. Upserted on the unique
  // (department, faculty) key so re-seeding converges without duplicates.
  const facultyIdBySlug = new Map(seedData.faculty.map((item) => [item.slug, item.id]));
  for (const department of seedData.departments) {
    for (const contact of department.contacts || []) {
      const facultyId = facultyIdBySlug.get(contact.facultySlug);
      if (!facultyId) throw new Error(`Unknown faculty slug "${contact.facultySlug}" in department ${department.slug}.`);
      await prisma.departmentContact.upsert({
        where: { departmentId_facultyId: { departmentId: department.id, facultyId } },
        update: { role: contact.role, order: contact.order ?? 0 },
        create: { departmentId: department.id, facultyId, role: contact.role, order: contact.order ?? 0 },
      });
    }
  }
  for (const item of seedData.laboratories) {
    await prisma.laboratory.upsert({ where: { id: item.id }, update: { slug: item.slug, name: item.name, description: item.description, equipment: item.equipment, courses: item.courses, researchRelevance: item.researchRelevance, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, name: item.name, description: item.description, equipment: item.equipment, courses: item.courses, researchRelevance: item.researchRelevance, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.researchAreas) {
    await prisma.researchArea.upsert({ where: { id: item.id }, update: { slug: item.slug, name: item.name, description: item.description, sourceNote: item.sourceNote, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, name: item.name, description: item.description, sourceNote: item.sourceNote, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.projects) {
    await prisma.project.upsert({ where: { id: item.id }, update: { slug: item.slug, title: item.title, summary: item.summary, sponsor: item.sponsor, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, title: item.title, summary: item.summary, sponsor: item.sponsor, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.publications) {
    await prisma.publication.upsert({ where: { id: item.id }, update: { slug: item.slug, title: item.title, venue: item.venue, year: item.year, doi: item.doi, url: item.url, abstract: item.abstract, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, title: item.title, venue: item.venue, year: item.year, doi: item.doi, url: item.url, abstract: item.abstract, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.achievements) {
    await prisma.achievement.upsert({ where: { id: item.id }, update: { title: item.title, category: item.category, description: item.description, recipient: item.recipient, year: item.year, eventName: item.eventName, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, title: item.title, category: item.category, description: item.description, recipient: item.recipient, year: item.year, eventName: item.eventName, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.events) {
    await prisma.event.upsert({ where: { id: item.id }, update: { slug: item.slug, title: item.title, summary: item.summary, startsAt: item.startsAt ? new Date(item.startsAt) : undefined, endsAt: item.endsAt ? new Date(item.endsAt) : undefined, location: item.location, registrationUrl: item.registrationUrl, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, title: item.title, summary: item.summary, startsAt: item.startsAt ? new Date(item.startsAt) : undefined, endsAt: item.endsAt ? new Date(item.endsAt) : undefined, location: item.location, registrationUrl: item.registrationUrl, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.organizations) {
    await prisma.studentOrganization.upsert({ where: { id: item.id }, update: { slug: item.slug, name: item.name, description: item.description, contactUrl: item.contactUrl, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, name: item.name, description: item.description, contactUrl: item.contactUrl, departmentId: item.departmentSlug ? departmentId.get(item.departmentSlug) : undefined, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  }
  for (const item of seedData.pages) await prisma.page.upsert({ where: { id: item.id }, update: { slug: item.slug, title: item.title, excerpt: item.excerpt, body: item.body, locale: item.locale, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null }, create: { id: item.id, slug: item.slug, title: item.title, excerpt: item.excerpt, body: item.body, locale: item.locale, status: item.status as any, publishedAt: item.status === "PUBLISHED" ? new Date() : null } });
  for (const item of seedData.links) await prisma.link.upsert({ where: { id: item.id }, update: { label: item.label, url: item.url, description: item.description, owner: item.owner, order: item.order, status: item.status as any }, create: { id: item.id, label: item.label, url: item.url, description: item.description, owner: item.owner, order: item.order, status: item.status as any } });
  for (const item of seedData.contacts) await prisma.contact.upsert({ where: { id: item.id }, update: { label: item.label, name: item.name, email: item.email, phone: item.phone, address: item.address, category: item.category, status: item.status as any }, create: { id: item.id, label: item.label, name: item.name, email: item.email, phone: item.phone, address: item.address, category: item.category, status: item.status as any } });
  for (const item of seedData.settings) await prisma.siteSetting.upsert({ where: { id: item.id }, update: { key: item.key, value: item.value, description: item.description }, create: { id: item.id, key: item.key, value: item.value, description: item.description } });
  console.log(`Seeded IET content and admin account ${adminEmail}.`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

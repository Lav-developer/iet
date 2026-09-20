import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seedData } from "../data/seed";
import { facultyProfileContent } from "../lib/faculty-profile";
import FacultyProfilePage from "../app/(public)/faculty/[slug]/page";
import type { FacultyMember, SiteData } from "../lib/types";

Object.assign(globalThis, { React });
const faculty: FacultyMember = {
  id: "profile-fixture", slug: "profile-fixture", name: "Dr. Test Faculty",
  designation: "Assistant Professor (Coordinator)", type: "FACULTY",
  qualification: "Ph.D. in Engineering", departmentSlug: "profile-department",
  email: "faculty@example.org", phone: "+91 12345 67890", status: "PUBLISHED",
};
const department: SiteData["departments"][number] = {
  id: "profile-department", slug: "profile-department", name: "Department of Test Engineering",
  overview: "A test-only department", status: "PUBLISHED",
};
const related: Partial<SiteData> = {
  researchAreas: [{ id: "area-id", slug: "area-slug", name: "Materials research", description: "Materials research description", facultySlugs: [faculty.id], status: "PUBLISHED" }],
  laboratories: [{ id: "lab-id", slug: "lab-slug", name: "Test laboratory", description: "Laboratory description", status: "PUBLISHED" }],
  projects: [{ id: "project-id", slug: "project-slug", title: "Test research project", summary: "Project description", sponsor: "Test sponsor", facultySlugs: [faculty.slug], status: "PUBLISHED" }],
  publications: [{ id: "publication-id", slug: "publication-slug", title: "Test publication", abstract: "Publication abstract", venue: "Test journal", year: 2025, url: "https://example.org/publication", authorSlugs: [faculty.id], status: "PUBLISHED" }],
  achievements: [{ id: "achievement-id", title: "Test research award", description: "Award description", category: "Research", recipient: faculty.name, year: 2025, eventName: "Test conference", status: "PUBLISHED" }],
};

// In-memory, per-test fixtures only. No database, CMS writes or seed command.
async function withProfile(person: FacultyMember, additions: Partial<SiteData>, check: (html: string) => void | Promise<void>) {
  const collections = { ...additions, departments: [department, ...(additions.departments || [])], faculty: [person, ...(additions.faculty || [])] };
  const restore: (() => void)[] = [];
  try {
    for (const [key, rows] of Object.entries(collections)) {
      const target = seedData[key as keyof SiteData] as unknown[];
      const length = target.length;
      restore.push(() => { target.splice(length); });
      target.push(...rows);
    }
    const html = renderToStaticMarkup(await FacultyProfilePage({ params: Promise.resolve({ slug: person.slug }) }));
    await check(html);
  } finally { restore.reverse().forEach((reset) => reset()); }
}

function assertPublicCopy(html: string) {
  assert.doesNotMatch(html, /Edit in CMS|Verified source record|Content provenance|Confirm before official public launch|Administrators can|source marker|record status|href="\/admin/i);
}

test("basic faculty profile restores identity, academic details, department and role without empty sections", async () => {
  await withProfile(faculty, {}, (html) => {
    assert.match(html, /aria-label="Profile information"/);
    assert.match(html, /<h2>Dr\. Test Faculty<\/h2>/);
    assert.match(html, /Assistant Professor \(Coordinator\)/);
    assert.match(html, /<h2 id="academic-details-heading">Academic details<\/h2>/);
    assert.match(html, /<dt>Qualification<\/dt><dd>Ph\.D\. in Engineering/);
    assert.match(html, /<dt>Department<\/dt>/);
    assert.match(html, /Department of Test Engineering/);
    assert.match(html, /<dt>Role type<\/dt><dd>Faculty<\/dd>/);
    assert.match(html, /href="mailto:faculty@example.org"/);
    assert.match(html, /href="tel:\+911234567890"/);
    assert.doesNotMatch(html, /id="(?:about-profile|research-expertise|profile-publications|profile-projects|profile-laboratories|profile-achievements)"/);
    assert.doesNotMatch(html, /No publications|No research|Awaiting|View CV|Download CV/);
    assertPublicCopy(html);
  });
});

test("rich profile renders bio, interests and all explicit published relationships including ID-linked publications", async () => {
  await withProfile({ ...faculty, profile: "First biography paragraph.\nSecond biography paragraph.", researchInterests: ["Materials modelling", "Energy systems"], laboratorySlugs: ["lab-id"] }, related, (html) => {
    for (const text of ["First biography paragraph.", "Second biography paragraph.", "Materials modelling", "Energy systems", "Materials research", "Materials research description", "Test laboratory", "Laboratory description", "Test research project", "Project description", "Test sponsor", "Test publication", "Publication abstract", "Test journal", "Test research award", "Award description", "Test conference", "2025"]) assert.ok(html.includes(text), `Missing published content: ${text}`);
    for (const href of ["/research#area-slug", "/laboratories/lab-slug", "https://example.org/publication"]) assert.ok(html.includes(`href="${href}"`), `Missing related link: ${href}`);
    assertPublicCopy(html);
  });
});

test("linked research still appears without free-text interests and publication-only profiles do not get empty research sections", async () => {
  await withProfile({ ...faculty, researchAreaSlugs: ["area-id"] }, { researchAreas: [{ ...related.researchAreas![0], facultySlugs: [] }] }, (html) => {
    assert.match(html, /id="research-expertise"/);
    assert.match(html, /Materials research/);
    assert.doesNotMatch(html, /<h3>Research interests<\/h3>/);
  });
  await withProfile(faculty, { publications: related.publications }, (html) => {
    assert.match(html, /id="profile-publications"/);
    assert.doesNotMatch(html, /id="research-expertise"/);
  });
});

test("blank optional fields do not create empty details, contact cards or an empty sidebar", async () => {
  await withProfile({ ...faculty, qualification: "  ", type: "", departmentSlug: undefined, email: " ", phone: "", profile: "\n", researchInterests: [" ", ""] }, {}, (html) => {
    assert.match(html, /aria-label="Profile information"/);
    assert.match(html, /faculty-profile-layout--single/);
    assert.doesNotMatch(html, /<aside|id="academic-details"|id="about-profile"|id="research-expertise"|<h2>Contact<\/h2>/);
    assertPublicCopy(html);
  });
});

test("staff, leadership and custom published role types are preserved rather than replaced with Faculty", async () => {
  for (const [type, label] of [["LABORATORY STAFF", "Laboratory staff"], ["NON-TEACHING STAFF", "Non-teaching staff"], ["LEADERSHIP", "Leadership"], ["Visiting researcher", "Visiting researcher"]]) {
    await withProfile({ ...faculty, type }, {}, (html) => assert.ok(html.includes(`<dt>Role type</dt><dd>${label}</dd>`)));
  }
});

test("DRAFT, REVIEW and ARCHIVED related records never appear on a published faculty profile", async () => {
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) {
    const hidden = Object.fromEntries(Object.entries(related).map(([key, rows]) => [key, rows.map((row) => ({ ...row, status }))])) as Partial<SiteData>;
    await withProfile({ ...faculty, laboratorySlugs: ["lab-id"], researchAreaSlugs: ["area-id"] }, hidden, (html) => {
      assert.doesNotMatch(html, /Materials research|Test laboratory|Test research project|Test publication|Test research award/);
      assert.doesNotMatch(html, /id="(?:research-expertise|profile-publications|profile-projects|profile-laboratories|profile-achievements)"/);
    });
  }
});

test("the public profile retains photo/CV support and never publishes a draft CV attachment", async () => {
  const key = "documents/2026/22222222-2222-4222-8222-222222222222.pdf";
  const imageKey = "media/2026/11111111-1111-4111-8111-111111111111.jpg";
  const assets: Partial<SiteData> = {
    media: [{ id: "profile-photo", key: imageKey, url: "/unused", altText: "Faculty portrait", mimeType: "image/jpeg" }],
    documents: [{ id: "profile-cv", key, url: "/unused", title: "Faculty CV", mimeType: "application/pdf", status: "PUBLISHED" }],
  };
  const person = { ...faculty, profileImageId: "profile-photo", cvDocumentId: "profile-cv" };
  await withProfile(person, assets, (html) => {
    assert.match(html, /alt="Faculty portrait"/);
    assert.ok(html.includes(`href="/api/media/${key}"`));
    assert.match(html, /Download CV \(PDF\)/);
    assert.match(html, /<dt>Role type<\/dt>/);
  });
  await withProfile({ ...person, cvUrl: "https://example.org/cv" }, assets, (html) => {
    assert.match(html, /href="https:\/\/example.org\/cv" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /View CV/);
  });
  await withProfile(person, { ...assets, documents: [{ ...assets.documents![0], status: "DRAFT" }] }, (html) => {
    assert.doesNotMatch(html, /Download CV|Curriculum vitae|\/api\/media\/documents/);
  });
});

test("related content resolver accepts slug and legacy ID references without guessing department connections", () => {
  const data = structuredClone(seedData);
  data.faculty.push(faculty);
  data.departments.push(department);
  for (const reference of [faculty.id, faculty.slug]) {
    data.projects = [{ ...related.projects![0], facultySlugs: [reference] }, { ...related.projects![0], id: "unrelated", title: "Unrelated project", departmentSlug: faculty.departmentSlug, facultySlugs: [] }];
    data.publications = [{ ...related.publications![0], authorSlugs: [reference] }];
    data.researchAreas = [{ ...related.researchAreas![0], facultySlugs: [reference] }];
    const content = facultyProfileContent(faculty, data);
    assert.equal(content.projects.length, 1);
    assert.equal(content.publications.length, 1);
    assert.equal(content.areas.length, 1);
  }
  data.departments = [{ ...department, status: "DRAFT" }];
  assert.equal(facultyProfileContent(faculty, data).department, undefined);
});

test("achievement recipients must match an unambiguous full name, not a team or a shared department", () => {
  const data = structuredClone(seedData);
  data.faculty.push(faculty);
  data.achievements = [
    related.achievements![0],
    { ...related.achievements![0], id: "team", recipient: `${faculty.name} and team` },
    { ...related.achievements![0], id: "department", recipient: undefined, departmentSlug: faculty.departmentSlug },
  ];
  assert.deepEqual(facultyProfileContent(faculty, data).achievements.map((item) => item.id), ["achievement-id"]);
  data.faculty.push({ ...faculty, id: "same-name", slug: "same-name" });
  assert.deepEqual(facultyProfileContent(faculty, data).achievements, []);
});

test("unpublished faculty still return 404", async () => {
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) {
    await assert.rejects(withProfile({ ...faculty, status }, {}, () => {}), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

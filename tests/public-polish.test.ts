import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seedData } from "../data/seed";
import { facultyAssets, safeExternalUrl } from "../lib/public-content";
import { publicCopy } from "../lib/public-copy";
import { preparePublicData } from "../lib/store";
import { sanitize, validatePayload } from "../lib/content-policy";
import { validateAssetRelations } from "../lib/faculty-relations";
import type { FacultyMember, StudentOrganization } from "../lib/types";
import OrganizationPage from "../app/(public)/organizations/[slug]/page";
import OrganizationsPage from "../app/(public)/organizations/page";
import { Avatar } from "../components/ui";
import { FacultyDirectory } from "../components/faculty-directory";
import FacultyProfilePage from "../app/(public)/faculty/[slug]/page";

// tsx uses the classic transform for the repository's Next-managed JSX setting.
Object.assign(globalThis, { React });
const person = (overrides: Partial<FacultyMember> = {}): FacultyMember => ({ id: "a", slug: "a", name: "Aakash", designation: "Assistant Professor", departmentSlug: "cse", type: "FACULTY", status: "PUBLISHED", ...overrides });

test("external links reject unsafe schemes, credentials, whitespace and non-HTTPS CVs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.org", "https://user:pass@example.org", "https://example.org/\ncv", "invalid"]) assert.equal(safeExternalUrl(url), undefined);
  assert.equal(safeExternalUrl("http://example.org", true), undefined);
  assert.equal(safeExternalUrl("https://example.org/cv", true), "https://example.org/cv");
  for (const cvUrl of ["http://example.org/cv", "javascript:alert(1)", "https://a:b@example.org", "broken"]) assert.throws(() => validatePayload("faculty", { cvUrl }), /HTTPS/);
  assert.doesNotThrow(() => validatePayload("faculty", { cvUrl: "https://example.org/cv.pdf" }));
  assert.doesNotThrow(() => validatePayload("faculty", { cvUrl: "" }));
  assert.throws(() => validatePayload("organizations", { contactUrl: "javascript:alert(1)" }), /URL/);
});
const imageKey = "media/2026/11111111-1111-4111-8111-111111111111.jpg";
const documentKey = "documents/2026/22222222-2222-4222-8222-222222222222.pdf";
test("faculty assets reuse the delivery route and preserve document publication rules", () => {
  const data = { media: [{ id: "image", key: imageKey, url: "https://untrusted.example", mimeType: "image/jpeg", altText: "Portrait of Archana" }], documents: [{ id: "cv", title: "CV", key: documentKey, url: "https://untrusted.example", mimeType: "application/pdf", status: "PUBLISHED" as const }] };
  const faculty = person({ profileImageId: "image", cvDocumentId: "cv" });
  const assets = facultyAssets(faculty, data);
  assert.equal(assets.profileImage?.url, `/api/media/${imageKey}`); assert.equal(assets.profileImage?.altText, "Portrait of Archana"); assert.deepEqual(assets.cv, { url: `/api/media/${documentKey}`, external: false });
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) assert.equal(facultyAssets(faculty, { ...data, documents: [{ ...data.documents[0], status }] }).cv, undefined);
  assert.equal(facultyAssets(person(), data).profileImage, undefined); assert.equal(facultyAssets(person(), data).cv, undefined);
  assert.equal(facultyAssets({ ...faculty, cvUrl: "https://example.org/cv" }, data).cv?.external, true);
  assert.equal(facultyAssets(faculty, { ...data, media: [{ ...data.media[0], key: documentKey }] }).profileImage, undefined);
  const html = renderToStaticMarkup(React.createElement(Avatar, { name: faculty.name, image: assets.profileImage }));
  assert.match(html, /alt="Portrait of Archana"/); assert.match(html, /\/api\/media\/media/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Avatar, { name: "Test Person" })), /<img/);
});
test("faculty fields survive sanitization, clearing values is allowed, and relation targets are validated", async () => {
  const payload = sanitize("faculty", { profileImageId: "image", cvDocumentId: "cv", cvUrl: "", maliciousField: "x" });
  assert.deepEqual(payload, { profileImageId: "image", cvDocumentId: "cv", cvUrl: "" });
  const admin = { role: "SUPER_ADMIN" as const };
  await assert.rejects(validateAssetRelations(admin, "faculty", payload, async () => null), /accessible/);
  await assert.rejects(validateAssetRelations(admin, "faculty", { profileImageId: "image" }, async () => ({ mimeType: "application/pdf" })), /image/);
  await assert.rejects(validateAssetRelations(admin, "faculty", { cvDocumentId: "cv" }, async () => ({ mimeType: "image/png" })), /PDF/);
  await assert.rejects(validateAssetRelations({ role: "DEPARTMENT_ADMIN", departmentId: "d" }, "faculty", { cvDocumentId: "cv" }, async () => ({ mimeType: "application/pdf", departmentSlug: "other", status: "DRAFT" }), "cse"), /accessible/);
  await assert.doesNotReject(validateAssetRelations(admin, "faculty", { profileImageId: "", cvDocumentId: null }, async () => { throw new Error("Should not look up cleared assets"); }));
});

test("public projection removes internal/nested draft data without mutating admin content", () => {
  const data = structuredClone(seedData);
  const original = data.departments[0].sourceNote;
  Object.assign(data.faculty[0], { department: { name: "Hidden department", status: "DRAFT" }, cvDocument: { title: "Hidden CV", status: "DRAFT" } });
  const result = preparePublicData(data);
  assert.equal(result.departments[0].sourceNote, undefined); assert.deepEqual(result.settings, []);
  assert.equal((result.faculty[0] as any).department, undefined); assert.equal((result.faculty[0] as any).cvDocument, undefined);
  assert.equal(data.departments[0].sourceNote, original);
  assert.equal(publicCopy("Original institutional content"), "Original institutional content");
});

const org: StudentOrganization = { id: "test-org", slug: "test-club", name: "Test club", description: "A test-only group", status: "PUBLISHED", contactUrl: "https://example.org/club" };
test("published organization cards link to their slug, and detail shows contact and associated published events", async () => {
  seedData.organizations.push(org);
  seedData.events.push({ id: "test-event", slug: "test-event", title: "Test event", summary: "Event for this club", organizationId: org.id, status: "PUBLISHED" }, { id: "hidden-event", slug: "hidden-event", title: "Hidden event", summary: "Hidden", organizationId: org.id, status: "DRAFT" });
  try {
    const listing = renderToStaticMarkup(await OrganizationsPage());
    assert.match(listing, /href="\/organizations\/test-club"/);
    const detail = renderToStaticMarkup(await OrganizationPage({ params: Promise.resolve({ slug: org.slug }) }));
    assert.match(detail, /Test club/); assert.match(detail, /href="https:\/\/example.org\/club"/); assert.match(detail, /noopener noreferrer/); assert.match(detail, /Test event/); assert.doesNotMatch(detail, /Hidden event/);
  } finally { seedData.organizations.pop(); seedData.events.splice(-2); }
});
test("organization without a contact or with an unsafe URL has no empty contact button", async () => {
  for (const contactUrl of [undefined, "javascript:alert(1)"]) {
    seedData.organizations.push({ ...org, contactUrl });
    try { assert.doesNotMatch(renderToStaticMarkup(await OrganizationPage({ params: Promise.resolve({ slug: org.slug }) })), /Official website \/ Contact/); }
    finally { seedData.organizations.pop(); }
  }
});
test("invalid and non-published organization slugs invoke Next's proper 404", async () => {
  await assert.rejects(OrganizationPage({ params: Promise.resolve({ slug: "missing-club" }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) {
    seedData.organizations.push({ ...org, status });
    try {
      await assert.rejects(OrganizationPage({ params: Promise.resolve({ slug: org.slug }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
      assert.doesNotMatch(renderToStaticMarkup(await OrganizationsPage()), /\/organizations\/test-club/);
    } finally { seedData.organizations.pop(); }
  }
});
test("directory and profile render a photograph and CV only when available", async () => {
  const faculty = person({ slug: "test-faculty", profileImageId: "test-image", cvUrl: "https://example.org/cv" });
  seedData.faculty.push(faculty); seedData.media.push({ id: "test-image", key: imageKey, url: `/api/media/${imageKey}`, mimeType: "image/jpeg", altText: "Test portrait" });
  try {
    const profile = renderToStaticMarkup(await FacultyProfilePage({ params: Promise.resolve({ slug: faculty.slug }) }));
    assert.match(profile, /alt="Test portrait"/); assert.match(profile, /View CV/); assert.match(profile, /noopener noreferrer/);
    const directory = renderToStaticMarkup(React.createElement(FacultyDirectory, { faculty: [{ ...faculty, ...facultyAssets(faculty, seedData) }], departments: [] }));
    assert.match(directory, /alt="Test portrait"/);
    delete faculty.cvUrl; delete faculty.profileImageId;
    const fallback = renderToStaticMarkup(await FacultyProfilePage({ params: Promise.resolve({ slug: faculty.slug }) }));
    assert.doesNotMatch(fallback, /View CV|Download CV|<img/);
  } finally { seedData.faculty.pop(); seedData.media.pop(); }
});

test("editors may reference published PDFs without being allowed to modify those documents", async () => {
  await assert.doesNotReject(validateAssetRelations({ role: "EDITOR" }, "faculty", { cvDocumentId: "published" }, async () => ({ mimeType: "application/pdf", status: "PUBLISHED" })));
  await assert.doesNotReject(validateAssetRelations({ role: "DEPARTMENT_ADMIN", departmentId: "cse-id" }, "faculty", { cvDocumentId: "published" }, async () => ({ mimeType: "application/pdf", status: "PUBLISHED", departmentSlug: "cse" }), "cse"));
});
test("unchanged faculty asset relations do not block scoped editors saving other fields", async () => {
  await assert.doesNotReject(validateAssetRelations({ role: "DEPARTMENT_ADMIN", departmentId: "cse-id" }, "faculty", { profileImageId: "existing-photo" }, async () => { throw new Error("An unchanged relation should not be reattached"); }, "cse", { profileImageId: "existing-photo" }));
});

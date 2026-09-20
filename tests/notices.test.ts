import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seedData } from "../data/seed";
import { preparePublicData } from "../lib/store";
import { sanitize, validatePayload, canAccess, workflowTransitionAllowed, departmentScoped } from "../lib/content-policy";
import { currentNotices, formatNoticeDate, isExpired, sortNotices, NOTICES_PAGE_SIZE } from "../lib/notices";
import NoticesPage from "../app/(public)/notices/page";
import NoticePage from "../app/(public)/notices/[slug]/page";
import type { DocumentRecord, Notice, SiteData } from "../lib/types";

Object.assign(globalThis, { React });

const pdfKey = "documents/2026/33333333-3333-4333-8333-333333333333.pdf";
const document: DocumentRecord = { id: "notice-pdf", title: "Official notice PDF", key: pdfKey, url: `/api/media/${pdfKey}`, mimeType: "application/pdf", status: "PUBLISHED" };

const textNotice: Notice = { id: "notice-text", slug: "semester-registration", title: "Semester registration window", summary: "Registration opens for all programmes.", body: "Registration opens on 1 October.\n\nStudents must complete the online form.", noticeType: "TEXT", noticeDate: "2026-09-10T00:00:00.000Z", category: "Academics", status: "PUBLISHED" };
const pdfNotice: Notice = { id: "notice-pdf", slug: "examination-schedule", title: "End semester examination schedule", summary: "The examination schedule is published as a PDF.", noticeType: "PDF", documentId: document.id, noticeDate: "2026-09-15T00:00:00.000Z", status: "PUBLISHED" };
const draftNotice: Notice = { ...textNotice, id: "notice-draft", slug: "unpublished-draft", title: "Unpublished draft notice", status: "DRAFT" };
const expiredNotice: Notice = { ...textNotice, id: "notice-expired", slug: "expired-scholarship", title: "Expired scholarship notice", noticeDate: "2025-01-05T00:00:00.000Z", expiryDate: "2025-02-05T00:00:00.000Z", status: "PUBLISHED" };

/** Fixtures live in the in-memory seed store only: no database, no CMS writes. */
async function withSite(notices: Notice[], documents: DocumentRecord[], check: (data: SiteData, html: (node: React.ReactElement) => string) => void | Promise<void>, options: { includeAll?: boolean } = {}) {
  const target = seedData.notices as Notice[];
  const documentTarget = seedData.documents as DocumentRecord[];
  const noticesLength = target.length, documentsLength = documentTarget.length;
  target.push(...notices); documentTarget.push(...documents);
  try {
    const data = preparePublicData(structuredClone(seedData));
    await check(options.includeAll ? structuredClone(seedData) : data, (node) => renderToStaticMarkup(node));
  } finally { target.splice(noticesLength); documentTarget.splice(documentsLength); }
}

const renderNoticesPage = (page = 1) => NoticesPage({ searchParams: Promise.resolve({ page: String(page) }) });

test("a text notice requires a body and a PDF notice requires an uploaded document", () => {
  assert.throws(() => validatePayload("notices", { title: "Notice", noticeType: "TEXT" }), /body/);
  assert.throws(() => validatePayload("notices", { title: "Notice", noticeType: "PDF" }), /document/);
  assert.doesNotThrow(() => validatePayload("notices", { title: "Notice", noticeType: "TEXT", body: "Body text" }));
  assert.doesNotThrow(() => validatePayload("notices", { title: "Notice", noticeType: "PDF", documentId: "doc-1" }));
  assert.throws(() => validatePayload("notices", { title: "", noticeType: "TEXT", body: "Body" }), /title/);
  assert.throws(() => validatePayload("notices", { title: "Notice", noticeType: "LINK", body: "Body" }), /TEXT or PDF/);
  assert.throws(() => validatePayload("notices", { title: "Notice", noticeType: "TEXT", body: "Body", noticeDate: "not-a-date" }), /valid date/);
  assert.throws(() => validatePayload("notices", { title: "Notice", noticeType: "TEXT", body: "Body", noticeDate: "2026-05-01", expiryDate: "2026-04-01" }), /before the notice date/);
  assert.doesNotThrow(() => validatePayload("notices", { title: "Notice", noticeType: "TEXT", body: "Body", noticeDate: "2026-05-01", expiryDate: "2026-06-01" }));
});

test("notice slugs are generated and unsupported payload fields are dropped", () => {
  const clean = sanitize("notices", { title: "End Semester Examination Schedule", noticeType: "TEXT", body: "Body", status: "PUBLISHED", sourceNote: "internal", document: { key: "x" } });
  assert.equal(clean.slug, "end-semester-examination-schedule");
  assert.equal(clean.status, "PUBLISHED");
  assert.equal((clean as Record<string, unknown>).sourceNote, undefined);
  assert.equal((clean as Record<string, unknown>).document, undefined);
});

test("only published notices reach the public surface", async () => {
  await withSite([textNotice, pdfNotice, draftNotice], [document], (data) => {
    const slugs = data.notices.map((notice) => notice.slug);
    assert.deepEqual(slugs.sort(), ["examination-schedule", "semester-registration"]);
    assert.equal(slugs.includes("unpublished-draft"), false);
    const blocked: Notice[] = ["REVIEW", "ARCHIVED"].map((status) => ({ ...textNotice, id: `notice-${status}`, slug: `notice-${status.toLowerCase()}`, status: status as Notice["status"] }));
    const filtered = preparePublicData({ ...structuredClone(seedData), notices: [...blocked, textNotice] });
    assert.deepEqual(filtered.notices.map((notice) => notice.slug), ["semester-registration"]);
  });
});

test("a PDF notice is public only while its linked PDF document is published", async () => {
  await withSite([pdfNotice], [document], (data) => {
    const notice = data.notices.find((item) => item.slug === pdfNotice.slug);
    assert.equal(notice?.pdf?.url, document.url);
    assert.equal(notice?.pdf?.title, document.title);
  });
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) {
    await withSite([pdfNotice], [{ ...document, status }], (data) => {
      assert.deepEqual(data.notices.filter((notice) => notice.slug === pdfNotice.slug), [], `${status} document must hide its notice`);
    });
  }
  await withSite([pdfNotice], [], (data) => {
    assert.deepEqual(data.notices.filter((notice) => notice.slug === pdfNotice.slug), [], "a missing document hides the PDF notice");
  });
  // A PDF notice stored without a document reference can never be published.
  await withSite([{ ...pdfNotice, documentId: null }], [document], (data) => {
    assert.equal(data.notices.some((notice) => notice.slug === pdfNotice.slug), false);
  });
});

test("notice ordering, expiry helpers and pagination constants behave predictably", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  assert.deepEqual(sortNotices([textNotice, pdfNotice]).map((notice) => notice.slug), ["examination-schedule", "semester-registration"]);
  assert.equal(isExpired(expiredNotice, now), true);
  assert.equal(isExpired(textNotice, now), false);
  assert.equal(isExpired({ ...textNotice, expiryDate: "2026-09-25T00:00:00.000Z" }, now), false);
  assert.deepEqual(currentNotices([textNotice, pdfNotice, expiredNotice], now).map((notice) => notice.slug), ["examination-schedule", "semester-registration"]);
  assert.equal(formatNoticeDate(textNotice.noticeDate), "10 Sept 2026");
  assert.equal(formatNoticeDate("not-a-date"), "");
  assert.equal(NOTICES_PAGE_SIZE, 10);
});

test("the notice list shows published notices newest first and clearly marks PDF notices", async () => {
  await withSite([textNotice, pdfNotice, draftNotice], [document], async (data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await renderNoticesPage()));
    assert.match(markup, /Semester registration window/);
    assert.match(markup, /End semester examination schedule/);
    assert.match(markup, /10 Sept 2026/);
    assert.match(markup, /PDF notice/);
    assert.match(markup, /href="\/notices\/semester-registration"/);
    assert.match(markup, /href="\/api\/media\/documents\/2026\/33333333-3333-4333-8333-333333333333.pdf" target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(markup, /Unpublished draft notice/);
    assert.ok(markup.indexOf("End semester examination schedule") < markup.indexOf("Semester registration window"), "newest notice first");
    assert.equal(data.notices.length, 2);
  });
});

test("the notice list hides expired notices, paginates and shows a proper empty state", async () => {
  await withSite([expiredNotice], [], async (_data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await renderNoticesPage()));
    assert.match(markup, /No notices are published/);
    assert.doesNotMatch(markup, /Expired scholarship notice/);
  });
  await withSite([textNotice, pdfNotice], [document], async (_data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await renderNoticesPage()));
    assert.doesNotMatch(markup, /No notices are published/);
  });
  const many: Notice[] = Array.from({ length: NOTICES_PAGE_SIZE + 2 }, (_, index) => ({ ...textNotice, id: `notice-${index}`, slug: `notice-${index}`, title: `Notice number ${index}`, noticeDate: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
  await withSite(many, [], async (_data, html) => {
    const first = await html(React.createElement(React.Fragment, null, await renderNoticesPage(1)));
    const second = await html(React.createElement(React.Fragment, null, await renderNoticesPage(2)));
    assert.match(first, /Page 1 of 2/);
    assert.match(first, /Older notices/);
    assert.match(second, /Page 2 of 2/);
    assert.match(second, /Previous notices/);
    assert.equal((first.match(/notice-card/g) || []).length, NOTICES_PAGE_SIZE);
    assert.equal((second.match(/notice-card/g) || []).length, 2);
    // An out-of-range page clamps instead of rendering nothing.
    const clamped = await html(React.createElement(React.Fragment, null, await renderNoticesPage(99)));
    assert.match(clamped, /Page 2 of 2/);
  });
});

test("a text notice opens as a readable detail page and a PDF notice offers view and download", async () => {
  await withSite([textNotice], [], async (_data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await NoticePage({ params: Promise.resolve({ slug: textNotice.slug }) })));
    assert.match(markup, /Semester registration window/);
    assert.match(markup, /Registration opens on 1 October\./);
    assert.match(markup, /Academics/);
    assert.match(markup, /href="\/notices"/);
    assert.doesNotMatch(markup, /Download PDF/);
  });
  await withSite([pdfNotice], [document], async (_data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await NoticePage({ params: Promise.resolve({ slug: pdfNotice.slug }) })));
    assert.match(markup, /End semester examination schedule/);
    assert.match(markup, /View PDF/);
    assert.match(markup, /Download PDF/);
    assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
    assert.match(markup, /download/);
  });
});

test("invalid, unpublished and document-less notice slugs return 404", async () => {
  for (const status of ["DRAFT", "REVIEW", "ARCHIVED"] as const) {
    await withSite([{ ...textNotice, status }], [], async () => {
      await assert.rejects(NoticePage({ params: Promise.resolve({ slug: textNotice.slug }) }), /NEXT_HTTP_ERROR_FALLBACK;404/, `${status} notice must 404`);
    });
  }
  await withSite([textNotice], [], async () => {
    await assert.rejects(NoticePage({ params: Promise.resolve({ slug: "does-not-exist" }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
  await withSite([pdfNotice], [{ ...document, status: "DRAFT" }], async () => {
    await assert.rejects(NoticePage({ params: Promise.resolve({ slug: pdfNotice.slug }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

test("an expired notice leaves the listings but stays reachable for reference", async () => {
  await withSite([expiredNotice], [], async (_data, html) => {
    const markup = await html(React.createElement(React.Fragment, null, await NoticePage({ params: Promise.resolve({ slug: expiredNotice.slug }) })));
    assert.match(markup, /Expired scholarship notice/);
    assert.match(markup, /This notice expired on/);
    const listing = await html(React.createElement(React.Fragment, null, await renderNoticesPage()));
    assert.doesNotMatch(listing, /Expired scholarship notice/);
  });
});

test("notices use the existing editorial workflow and department scoping", () => {
  assert.equal(departmentScoped.has("notices"), true);
  const own = { id: "n1", status: "DRAFT", departmentSlug: "computer-science-engineering" };
  assert.equal(canAccess({ role: "EDITOR" }, "notices", "write", { status: "DRAFT" }, own), true);
  assert.equal(canAccess({ role: "EDITOR" }, "notices", "write", { status: "PUBLISHED" }, own), false);
  assert.equal(canAccess({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "notices", "write", { status: "DRAFT" }, own, "computer-science-engineering"), true);
  assert.equal(canAccess({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "notices", "write", { status: "DRAFT", departmentSlug: "civil-engineering" }, own, "computer-science-engineering"), false);
  assert.equal(canAccess({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "notices", "delete", undefined, own, "computer-science-engineering"), false);
  assert.equal(canAccess({ role: "SUPER_ADMIN" }, "notices", "write", { status: "PUBLISHED" }), true);
  assert.equal(workflowTransitionAllowed({ role: "EDITOR" }, own, "REVIEW"), true);
  assert.equal(workflowTransitionAllowed({ role: "EDITOR" }, { ...own, status: "REVIEW" }, "PUBLISHED"), false);
  assert.equal(workflowTransitionAllowed({ role: "IET_ADMIN" }, { ...own, status: "REVIEW" }, "PUBLISHED"), true);
  assert.equal(workflowTransitionAllowed({ role: "IET_ADMIN" }, { ...own, status: "PUBLISHED" }, "ARCHIVED"), true);
});

test("the notice schema, migration and admin editor are wired without touching existing migrations", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model Notice \{/);
  assert.match(schema, /noticeType\s+String\s+@default\("TEXT"\)/);
  assert.match(schema, /document\s+Document\?\s+@relation\("NoticeDocument"/);
  assert.match(schema, /expiryDate\s+DateTime\?/);

  const migration = readFileSync("prisma/migrations/0006_notices_and_department_social_links/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "Notice"/);
  assert.match(migration, /"noticeType" TEXT NOT NULL DEFAULT 'TEXT'/);
  assert.match(migration, /FOREIGN KEY \("documentId"\) REFERENCES "Document"\("id"\) ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN/);
  // The previous migration is untouched by this work.
  const previous = readFileSync("prisma/migrations/0005_faculty_profile_assets/migration.sql", "utf8");
  assert.match(previous, /ADD COLUMN "cvDocumentId" TEXT/);

  const admin = readFileSync("components/entity-manager.tsx", "utf8");
  assert.match(admin, /notices: \{ title: "Notices"/);
  assert.match(admin, /fieldKey === "cvDocumentId" \|\| fieldKey === "documentId" \? "documents"/);
  assert.match(readFileSync("components/admin-shell.tsx", "utf8"), /\["notices", "Notices", Newspaper\]/);
  assert.match(readFileSync("lib/content-policy.ts", "utf8"), /notices: new Set\(\["title", "slug", "summary", "body", "noticeType", "documentId", "noticeDate", "expiryDate", "category", "departmentSlug", "status"\]\)/);
});

test("PDF notices never store the document itself: only the existing Document/MEDIA reference is used", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const noticeModel = schema.slice(schema.indexOf("model Notice {"), schema.indexOf("model Notice {") + 1200);
  assert.doesNotMatch(noticeModel, /Bytes|Buffer|file\s+String/);
  assert.match(noticeModel, /documentId\s+String\?/);
  const upload = readFileSync("app/api/admin/media/upload/route.ts", "utf8");
  assert.match(upload, /validateUpload\(file\.type, file\.size, collection\)/, "the existing upload validation is reused");
  assert.match(upload, /validateMagicBytes\(buffer, file\.type\)/, "PDF magic-byte validation is reused");
  assert.match(readFileSync("lib/storage.ts", "utf8"), /const isPdf = buffer\.length >= 5 && buffer\.subarray\(0, 5\)\.toString\("ascii"\) === "%PDF-"/);
});

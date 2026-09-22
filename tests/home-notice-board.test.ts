import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeNoticeBoard } from "../components/notice-board";
import { HOME_NOTICE_COUNT, homeNotices } from "../lib/notices";
import { preparePublicData } from "../lib/store";
import { seedData } from "../data/seed";
import type { DocumentRecord, Notice, SiteData } from "../lib/types";

Object.assign(globalThis, { React });

const pdfKey = "documents/2026/44444444-4444-4444-8444-444444444444.pdf";
const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T00:00:00.000Z`;
const notice = (n: number, extra: Partial<Notice> = {}): Notice => ({ id: `n${n}`, slug: `notice-${n}`, title: `Notice ${n}`, body: "Text", noticeType: "TEXT", noticeDate: day(n), status: "PUBLISHED", ...extra });

test("the homepage board shows the five newest current published notices", () => {
  const notices = [1, 2, 3, 4, 5, 6, 7].map((n) => notice(n));
  const expired = notice(20, { expiryDate: "2026-09-01T00:00:00.000Z" });
  const shown = homeNotices([...notices, expired], new Date("2026-09-25T00:00:00.000Z"));
  assert.equal(HOME_NOTICE_COUNT, 5);
  assert.deepEqual(shown.map((item) => item.id), ["n7", "n6", "n5", "n4", "n3"], "newest first, capped at five, expired notices excluded");
});

test("each item carries title, date, department or institute, Text/PDF type and View / View PDF links; View all links to the board", () => {
  const pdf = notice(9, { title: "Examination schedule", noticeType: "PDF", pdf: { url: `/api/media/${pdfKey}`, title: "Examination schedule" }, departmentName: "Computer Science & Engineering", departmentSlug: "computer-science-engineering", body: undefined });
  const text = notice(8, { title: "Semester registration" });
  const markup = renderToStaticMarkup(React.createElement(HomeNoticeBoard, { notices: [text, pdf] }));
  assert.match(markup, /Latest notices/);
  assert.match(markup, /href="\/notices"[^>]*>View all notices</);
  // PDF notice
  assert.match(markup, /Computer Science &amp; Engineering/);
  assert.match(markup, /class="notice-type pdf">PDF</);
  assert.match(markup, /href="\/notices\/notice-9"[^>]*>Examination schedule</);
  assert.match(markup, new RegExp(`href="/api/media/${pdfKey.replace(/\//g, "\\/")}" target="_blank" rel="noopener noreferrer"[^>]*>.*View PDF`));
  // Text notice: institute attribution and a View link, no PDF link
  assert.match(markup, /class="notice-type">Text</);
  assert.match(markup, /Institute of Engineering &amp; Technology</);
  const textItem = markup.slice(markup.indexOf("notice-8"));
  assert.doesNotMatch(textItem, /View PDF/);
  assert.match(textItem, /href="\/notices\/notice-8"[^>]*>View</);
  // Dates are rendered as <time> with machine-readable values.
  assert.match(markup, /<time class="notice-date" dateTime="2026-09-09T00:00:00.000Z">/);
  // Order: newest (PDF, 9 Sept) first.
  assert.ok(markup.indexOf("notice-9") < markup.indexOf("notice-8"));
});

test("only published notices can reach the board; a PDF notice without a published PDF is not listed", () => {
  const publishedDocument: DocumentRecord = { id: "doc-pub", title: "Published PDF", key: pdfKey, url: `/api/media/${pdfKey}`, mimeType: "application/pdf", status: "PUBLISHED" };
  const draftDocument: DocumentRecord = { id: "doc-draft", title: "Draft PDF", key: "documents/2026/55555555-5555-4555-8555-555555555555.pdf", url: "/api/media/documents/2026/55555555-5555-4555-8555-555555555555.pdf", mimeType: "application/pdf", status: "DRAFT" };
  const data: SiteData = {
    ...seedData,
    documents: [publishedDocument, draftDocument],
    notices: [
      notice(1, { title: "Live text notice" }),
      notice(2, { title: "Draft notice", status: "DRAFT" }),
      notice(3, { title: "Notice in review", status: "REVIEW" }),
      notice(4, { title: "Live PDF notice", noticeType: "PDF", documentId: "doc-pub", body: undefined }),
      notice(5, { title: "PDF notice with unpublished PDF", noticeType: "PDF", documentId: "doc-draft", body: undefined }),
    ],
  };
  const publicData = preparePublicData(data);
  const markup = renderToStaticMarkup(React.createElement(HomeNoticeBoard, { notices: publicData.notices }));
  assert.match(markup, /Live text notice/);
  assert.match(markup, /Live PDF notice/);
  assert.match(markup, new RegExp(`href="/api/media/${pdfKey.replace(/\//g, "\\/")}"`), "the published PDF is linked");
  for (const hidden of ["Draft notice", "Notice in review", "PDF notice with unpublished PDF"]) assert.doesNotMatch(markup, new RegExp(hidden), `${hidden} is hidden`);
  assert.doesNotMatch(markup, /55555555-5555/, "an unpublished PDF is never linked");
  // Empty state when nothing is published.
  const empty = renderToStaticMarkup(React.createElement(HomeNoticeBoard, { notices: [] }));
  assert.match(empty, /No notices are published at the moment\./);
  assert.match(empty, /href="\/notices"/);
});

test("the homepage uses the board component and the board never renders internal identifiers or storage keys", () => {
  const page = readFileSync("app/(public)/page.tsx", "utf8");
  assert.match(page, /<HomeNoticeBoard notices=\{data\.notices\} \/>/);
  assert.doesNotMatch(page, /latestNotices/);
  const component = readFileSync("components/notice-board.tsx", "utf8");
  assert.doesNotMatch(component, />\{notice\.id\}|documentId|\.key\b|mimeType/);
  assert.match(component, /homeNotices\(notices\)/);
  // The CSS keeps the board responsive: one column under 780px.
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.home-notice-list li \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /@media \(max-width: 780px\) \{ \.notice-card, \.home-notices, \.home-notice-list li \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

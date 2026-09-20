import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seedData } from "../data/seed";
import { publicSocialLinks, preparePublicData } from "../lib/store";
import { sanitize, validatePayload, validateSocialLinks, MAX_SOCIAL_LINKS } from "../lib/content-policy";
import { DepartmentSocialLinks } from "../components/department-social";
import DepartmentPage from "../app/(public)/departments/[slug]/page";
import type { Department } from "../lib/types";

Object.assign(globalThis, { React });

const department: Department = {
  id: "social-department", slug: "social-department", name: "Department of Test Engineering",
  shortName: "TE", overview: "A test-only department profile.", established: "2016", status: "PUBLISHED",
};

test("all supported platforms accept validated absolute URLs and are stored in submit order", () => {
  const links = validateSocialLinks([
    { platform: "instagram", url: "https://instagram.com/iet" },
    { platform: "FACEBOOK", url: "https://facebook.com/iet" },
    { platform: "LINKEDIN", url: "https://linkedin.com/company/iet" },
    { platform: "X", url: "https://x.com/iet" },
    { platform: "YOUTUBE", url: "https://youtube.com/@iet" },
    { platform: "WEBSITE", url: "http://iet.example.ac.in" },
    { platform: "OTHER", url: "https://example.org/iet-channel", label: "Alumni chapter" },
  ]);
  assert.equal(links.length, 7);
  assert.deepEqual(links.map((link) => link.platform), ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "X", "YOUTUBE", "WEBSITE", "OTHER"]);
  assert.deepEqual(links.map((link) => link.order), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(links[6].label, "Alumni chapter");
  assert.equal(links[6].platform === "OTHER" && links[6].url, "https://example.org/iet-channel");
});

test("invalid, insecure and non-URL values are rejected with an actionable message", () => {
  const rejected: Array<[string, unknown]> = [
    ["javascript:", [{ platform: "WEBSITE", url: "javascript:alert(1)" }]],
    ["relative", [{ platform: "WEBSITE", url: "/departments/test" }]],
    ["plain host", [{ platform: "INSTAGRAM", url: "instagram.com/iet" }]],
    ["http on a social platform", [{ platform: "INSTAGRAM", url: "http://instagram.com/iet" }]],
    ["credentials", [{ platform: "FACEBOOK", url: "https://user:pass@facebook.com/iet" }]],
    ["internal whitespace", [{ platform: "X", url: "https://x.com/ iet" }]],
    ["control characters", [{ platform: "YOUTUBE", url: "https://youtube.com/@iet\u0001" }]],
    ["unknown platform", [{ platform: "TIKTOK", url: "https://tiktok.com/@iet" }]],
    ["other without a label", [{ platform: "OTHER", url: "https://example.org/x" }]],
    ["too many", Array.from({ length: MAX_SOCIAL_LINKS + 1 }, (_, index) => ({ platform: "WEBSITE", url: `https://example.org/${index}` }))],
    ["not a list", "https://instagram.com/iet"],
  ];
  for (const [label, value] of rejected) assert.throws(() => validateSocialLinks(value), /INVALID_INPUT/, `${label} must be rejected`);
  // Surrounding whitespace is trimmed rather than rejected, so pasted URLs work.
  assert.deepEqual(validateSocialLinks([{ platform: "X", url: "  https://x.com/iet  " }])[0].url, "https://x.com/iet");
  // An empty configuration is valid and simply publishes nothing.
  assert.deepEqual(validateSocialLinks(undefined), []);
  assert.deepEqual(validateSocialLinks(""), []);
  assert.deepEqual(validateSocialLinks([]), []);
});

test("the CMS payload path validates department social links and keeps them structured", () => {
  const sanitized = sanitize("departments", { name: "Department of Test Engineering", socialLinks: [{ platform: "YOUTUBE", url: "https://youtube.com/@iet", evil: "<script>" }] });
  assert.deepEqual(sanitized.socialLinks, [{ platform: "YOUTUBE", url: "https://youtube.com/@iet", order: 0 }]);
  assert.doesNotThrow(() => validatePayload("departments", sanitized));
  assert.throws(() => validatePayload("departments", { socialLinks: [{ platform: "INSTAGRAM", url: "http://instagram.com/iet" }] }), /HTTPS/);
  assert.throws(() => validatePayload("departments", { socialLinks: [{ platform: "OTHER", url: "https://example.org/x" }] }), /label/);
});

test("only configured, well-formed links are published, in display order", () => {
  const links = publicSocialLinks([
    { platform: "YOUTUBE", url: "https://youtube.com/@iet", order: 2 },
    { platform: "INSTAGRAM", url: "https://instagram.com/iet", order: 0 },
    { platform: "WEBSITE", url: "javascript:alert(1)", order: 1 },
    { platform: "OTHER", url: "  ", order: 3 },
    { platform: "weird", url: "https://example.org/other", order: 4 },
  ]);
  assert.deepEqual(links.map((link) => link.url), ["https://instagram.com/iet", "https://youtube.com/@iet", "https://example.org/other"]);
  assert.deepEqual(links.map((link) => link.platform), ["INSTAGRAM", "YOUTUBE", "WEIRD"]);
  assert.deepEqual(publicSocialLinks(undefined), []);
});

test("the public projection drops hand-crafted unsafe links and unpublished departments", () => {
  const data = structuredClone(seedData);
  data.departments.push({ ...department, socialLinks: [{ platform: "INSTAGRAM", url: "https://instagram.com/iet", order: 0 }, { platform: "WEBSITE", url: "javascript:alert(1)", order: 1 }] });
  data.departments.push({ ...department, id: "draft-department", slug: "draft-department", status: "DRAFT", socialLinks: [{ platform: "FACEBOOK", url: "https://facebook.com/draft", order: 0 }] });
  const result = preparePublicData(data);
  const published = result.departments.find((item) => item.slug === "social-department");
  assert.deepEqual(published?.socialLinks?.map((link) => link.url), ["https://instagram.com/iet"]);
  assert.equal(result.departments.some((item) => item.slug === "draft-department"), false);
  // Seeded departments have no invented channels.
  assert.deepEqual(result.departments.find((item) => item.slug === "civil-engineering")?.socialLinks, []);
});

test("the channel list renders accessible external links, or nothing at all", () => {
  const empty = renderToStaticMarkup(React.createElement(DepartmentSocialLinks, { links: undefined, departmentName: "Test" }));
  assert.equal(empty, "");
  assert.equal(renderToStaticMarkup(React.createElement(DepartmentSocialLinks, { links: [], departmentName: "Test" })), "");

  const html = renderToStaticMarkup(React.createElement(DepartmentSocialLinks, {
    departmentName: "Department of Test Engineering",
    links: [
      { platform: "INSTAGRAM", url: "https://instagram.com/iet", order: 0 },
      { platform: "X", url: "https://x.com/iet", order: 1 },
      { platform: "OTHER", url: "https://example.org/alumni", label: "Alumni chapter", order: 2 },
    ],
  }));
  assert.match(html, /href="https:\/\/instagram.com\/iet" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /aria-label="Department of Test Engineering — Instagram \(opens in a new tab\)"/);
  assert.match(html, /X \(Twitter\)/);
  assert.match(html, /Alumni chapter/);
  assert.equal((html.match(/target="_blank"/g) || []).length, 3);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 3);
});

async function withDepartment(links: Department["socialLinks"], check: (html: string) => void) {
  const target = seedData.departments as Department[];
  const length = target.length;
  target.push({ ...department, ...(links ? { socialLinks: links } : {}) });
  try { check(renderToStaticMarkup(await DepartmentPage({ params: Promise.resolve({ slug: department.slug }) }))); }
  finally { target.splice(length); }
}

test("a department profile shows the channels section only when official links are configured", async () => {
  await withDepartment(undefined, (html) => {
    assert.doesNotMatch(html, /Department channels|id="channels"/);
  });
  await withDepartment([{ platform: "LINKEDIN", url: "https://linkedin.com/company/iet", order: 0 }], (html) => {
    assert.match(html, /id="channels"/);
    assert.match(html, /Department channels/);
    assert.match(html, /LinkedIn/);
    assert.match(html, /href="https:\/\/linkedin.com\/company\/iet"/);
    assert.doesNotMatch(html, /javascript:/i);
  });
});

test("social links use the existing department migration path and never store HTML", () => {
  const migration = readFileSync("prisma/migrations/0006_notices_and_department_social_links/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "DepartmentSocialLink"/);
  assert.match(migration, /"url" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model DepartmentSocialLink/);
  assert.match(schema, /socialLinks\s+DepartmentSocialLink\[\]/);
  const editor = readFileSync("components/entity-manager.tsx", "utf8");
  assert.match(editor, /SocialLinksEditor/);
  assert.match(editor, /entity === "departments" && <SocialLinksEditor/);
  // Structured values only: nothing renders stored markup.
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(readFileSync("components/department-social.tsx", "utf8"), /dangerouslySetInnerHTML/);
});

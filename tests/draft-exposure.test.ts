import test from "node:test";
import assert from "node:assert/strict";
import { getSiteData } from "../lib/store";

// With no DATABASE_URL the store serves the deterministic demo seed. The
// public surface (includeDrafts omitted) must expose PUBLISHED records only,
// while the admin surface (includeDrafts: true) must expose the seeded DRAFT
// placeholders.

const COLLECTIONS = ["departments", "programs", "faculty", "laboratories", "researchAreas", "projects", "publications", "achievements", "events", "organizations", "pages", "links", "contacts"] as const;

test("public site data contains no DRAFT / REVIEW / ARCHIVED records", async () => {
  const data = await getSiteData();
  for (const collection of COLLECTIONS) {
    const items = (data[collection] as Array<{ status?: string; id?: string }>) ?? [];
    for (const item of items) {
      assert.equal(item.status, "PUBLISHED", `${collection}/${item.id} leaked with status ${item.status}`);
    }
  }
});

test("the seeded DRAFT project placeholder is absent from public data", async () => {
  const data = await getSiteData();
  const ids = new Set(data.projects.map((p) => p.id));
  assert.equal(ids.has("project-placeholder"), false, "DRAFT placeholder leaked to the public surface");
});

test("the seeded DRAFT placeholders are present in the admin (includeDrafts) data", async () => {
  const data = await getSiteData({ includeDrafts: true });
  const ids = new Set(data.projects.map((p) => p.id));
  assert.equal(ids.has("project-placeholder"), true, "DRAFT placeholder missing from admin surface");
  const placeholder = data.projects.find((p) => p.id === "project-placeholder");
  assert.equal(placeholder?.status, "DRAFT");
});

test("admin surface is a superset of the public surface", async () => {
  const pub = await getSiteData();
  const all = await getSiteData({ includeDrafts: true });
  for (const collection of COLLECTIONS) {
    const pubIds = new Set((pub[collection] as Array<{ id: string }>).map((item) => item.id));
    const allIds = (all[collection] as Array<{ id: string }>).map((item) => item.id);
    for (const id of pubIds) assert.ok(allIds.includes(id), `${collection}/${id} present publicly but missing in admin data`);
  }
});

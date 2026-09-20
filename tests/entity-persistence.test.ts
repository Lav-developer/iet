import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { entitiesWithPublishedAt } from "../lib/store";
import type { EntityName } from "../lib/types";

const store = readFileSync("lib/store.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

/** entity → Prisma delegate, read from the store's own write switch. */
function delegateByEntity() {
  const body = store.slice(store.indexOf("async function upsertDatabaseEntity"), store.indexOf("async function syncRelationships"));
  const map = new Map<string, string>();
  for (const match of body.matchAll(/case "(\w+)": saved = \(id \? await client\.(\w+)\.update/g)) map.set(match[1], match[2]);
  return map;
}

/** Prisma model → declared scalar fields, straight from the schema file. */
function modelFields() {
  const models = new Map<string, Set<string>>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields = new Set([...match[2].matchAll(/^\s+(\w+)\s+\S/gm)].map((field) => field[1]));
    models.set(match[1], fields);
  }
  return models;
}

const delegates = delegateByEntity();
const models = modelFields();
const modelName = (entity: string) => {
  const delegate = delegates.get(entity);
  assert.ok(delegate, `${entity} has a database write path`);
  return delegate[0].toUpperCase() + delegate.slice(1);
};

test("the publishedAt allowlist matches the schema exactly", () => {
  const expected = [...delegates.keys()].filter((entity) => models.get(modelName(entity))?.has("publishedAt"));
  assert.deepEqual([...entitiesWithPublishedAt].sort(), [...expected].sort(), "no entity receives a publishedAt its model does not declare");
  // The three models that carry a status without a publish timestamp are the
  // reason this list has to exist at all.
  for (const entity of ["documents", "links", "contacts"]) {
    assert.equal(entitiesWithPublishedAt.has(entity as EntityName), false, `${entity} has no publishedAt column`);
    assert.equal(models.get(modelName(entity))?.has("status"), true, `${entity} still carries a workflow status`);
  }
  assert.equal(entitiesWithPublishedAt.has("media"), false);
  assert.equal(entitiesWithPublishedAt.has("settings"), false);
  assert.equal(entitiesWithPublishedAt.has("notices"), true, "notices are published and timestamped");
});

test("a status write never sends unknown fields to a model without publishedAt", () => {
  const normalize = store.slice(store.indexOf("async function normalizeDatabasePayload"), store.indexOf("export async function searchSite"));
  assert.match(normalize, /if \(entitiesWithPublishedAt\.has\(entity\)\) data\.publishedAt = payload\.status === "PUBLISHED" \? new Date\(\) : null;/);
  assert.doesNotMatch(normalize, /^ {4}data\.publishedAt = payload\.status/m, "an unguarded assignment is what broke document uploads");
  // Default statuses are only written for models that declare one.
  assert.match(normalize, /else if \(!id && entity !== "settings" && entity !== "media"\)/);
  for (const [entity, delegate] of delegates) {
    if (entity === "settings" || entity === "media") continue;
    assert.equal(models.get(modelName(entity))?.has("status"), true, `${entity} (${delegate}) receives a default status and must declare one`);
  }
});

test("every field the store writes to a document exists on the Document model", () => {
  const fields = models.get("Document");
  assert.ok(fields);
  const upload = readFileSync("app/api/admin/media/upload/route.ts", "utf8");
  const start = upload.indexOf('upsertEntity("documents"');
  assert.ok(start > -1, "the upload route writes a document record");
  const documentPayload = upload.slice(start, upload.indexOf("return NextResponse.json({ record }", start));
  for (const key of ["title", "description", "status", "sizeBytes", "mimeType", "altText", "key", "url"]) {
    assert.ok(fields.has(key), `Document.${key} exists`);
  }
  // The upload path creates a document record and never a timestamp of its own.
  assert.match(documentPayload, /upsertEntity\("documents", \{ \.\.\.common, title:/);
  assert.doesNotMatch(documentPayload, /publishedAt/);
  // The store drops client-supplied timestamps before they reach Prisma.
  assert.match(store, /const omit = new Set\(\["id", "createdAt", "updatedAt", "publishedAt"/);
});

test("the write path maps every entity to the model the schema declares", () => {
  assert.equal(delegates.size, 17);
  assert.deepEqual([...delegates.keys()].sort(), ["contacts", "departments", "documents", "events", "faculty", "laboratories", "links", "media", "notices", "organizations", "pages", "programs", "projects", "publications", "researchAreas", "settings", "achievements"].sort());
  for (const [entity, delegate] of delegates) {
    assert.ok(models.has(modelName(entity)), `${entity} → ${delegate} resolves to model ${modelName(entity)}`);
  }
});

test("a partial update never rewrites fields the request did not send", () => {
  const normalize = store.slice(store.indexOf("async function normalizeDatabasePayload"), store.indexOf("export async function searchSite"));
  // noticeType used to be derived on every write, so a workflow-only status
  // change turned a PDF notice into an empty text notice.
  assert.match(normalize, /if \(payload\.noticeType !== undefined\) data\.noticeType = String\(payload\.noticeType\)\.toUpperCase\(\) === "PDF" \? "PDF" : "TEXT";/);
  assert.doesNotMatch(normalize, /data\.noticeType = String\(payload\.noticeType \|\| "TEXT"\)/);
  // Every other derived write is guarded by an explicit presence check, or is
  // the create-only status default that only runs when there is no record yet.
  for (const guard of [
    /if \(payload\.status !== undefined\) \{/,
    /else if \(!id && entity !== "settings" && entity !== "media"\) \{/,
    /if \(payload\.departmentSlug && \[/,
    /if \(\["publications", "notices"\]\.includes\(entity\) && !data\.slug && payload\.title\)/,
    /if \(payload\[key\] === "" \|\| payload\[key\] === null\)/,
  ]) assert.match(normalize, guard, `missing guard: ${guard}`);
  // The model keeps its own default for new notices.
  const noticeModel = models.get("Notice");
  assert.ok(noticeModel?.has("noticeType"));
  assert.match(schema, /noticeType\s+String\s+@default\("TEXT"\)/);
});

test("status transitions keep the server-owned publish timestamp", () => {
  const normalize = store.slice(store.indexOf("async function normalizeDatabasePayload"), store.indexOf("export async function searchSite"));
  assert.match(normalize, /Client-supplied timestamps are never trusted/);
  assert.match(normalize, /data\.status = payload\.status;/);
  // Publishing sets the timestamp, unpublishing clears it — for the models
  // that have the column.
  assert.match(normalize, /payload\.status === "PUBLISHED" \? new Date\(\) : null/);
});

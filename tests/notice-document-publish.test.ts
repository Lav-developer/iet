import test, { before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The file-backed store writes under process.cwd()/.data, so this test runs in
// a private temporary directory: it never touches the repository's own store
// (and, with DATABASE_URL unset by the test script, never a database). The
// store module is loaded after the directory change so its paths resolve there.
const repoRoot = process.cwd();
let store: typeof import("../lib/store");
before(async () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), "iet-notice-publish-")));
  store = await import("../lib/store");
});

const DOCUMENT_KEY = "documents/2026/0f9c5f0e-6a3b-4c7e-9a2b-2f3a1c4d5e6f.pdf";
const UNRELATED_KEY = "documents/2026/1a2b3c4d-1111-4222-8333-444455556666.pdf";
const actor = ["iet.admin@example.test", undefined, "user-iet-admin", "IET_ADMIN", "127.0.0.1"] as const;

type Saved = { id: string; status?: string };

async function createDraftDocument(title: string, key: string): Promise<Saved> {
  // Same shape the upload route stores (key + public delivery URL + type).
  return store.upsertEntity("documents", { title, key, url: `/api/media/${key}`, mimeType: "application/pdf", sizeBytes: 1024, status: "DRAFT" }, actor[0], actor[1], actor[2], actor[3], actor[4]) as Promise<Saved>;
}

async function storedDocument(id: string): Promise<Saved | undefined> {
  const rows = (await store.getEntity("documents", true)) as Saved[];
  return rows.find((row) => row.id === id);
}

test("only a published PDF notice names a document to publish, and only its own document", () => {
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "PUBLISHED", noticeType: "PDF", documentId: "doc-1" }), "doc-1");
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "PUBLISHED", noticeType: "pdf", documentId: "doc-1" }), "doc-1");
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "DRAFT", noticeType: "PDF", documentId: "doc-1" }), undefined, "a draft notice publishes nothing");
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "REVIEW", noticeType: "PDF", documentId: "doc-1" }), undefined, "a notice in review publishes nothing");
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "PUBLISHED", noticeType: "TEXT", documentId: "doc-1" }), undefined, "a text notice publishes nothing");
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "PUBLISHED", noticeType: "PDF", documentId: "" }), undefined);
  assert.equal(store.linkedNoticeDocumentToPublish("notices", { status: "PUBLISHED", noticeType: "PDF", documentId: null }), undefined);
  // Other entities never trigger a document publish, whatever they carry.
  assert.equal(store.linkedNoticeDocumentToPublish("faculty", { status: "PUBLISHED", noticeType: "PDF", documentId: "doc-1", cvDocumentId: "doc-2" }), undefined);
  assert.equal(store.linkedNoticeDocumentToPublish("documents", { status: "PUBLISHED", documentId: "doc-1" }), undefined);
});

test("database path: publishing a PDF notice publishes exactly its linked document, inside the notice's transaction, with an audit entry", async () => {
  const documents = new Map<string, Record<string, unknown>>([
    ["doc-linked", { id: "doc-linked", status: "DRAFT", title: "Exam schedule" }],
    ["doc-unrelated", { id: "doc-unrelated", status: "DRAFT", title: "Another draft" }],
    ["doc-live", { id: "doc-live", status: "PUBLISHED", title: "Already public" }],
  ]);
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = [];
  const audits: Record<string, unknown>[] = [];
  const tx = {
    document: {
      findUnique: async ({ where }: { where: { id: string } }) => documents.get(where.id) ?? null,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        const next = { ...documents.get(args.where.id), ...args.data };
        documents.set(args.where.id, next);
        return next;
      },
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; } },
  };
  const client = tx as unknown as Parameters<typeof store.publishLinkedNoticeDocument>[3];
  const audit = { user: "iet.admin@example.test", userId: "user-iet-admin", role: "IET_ADMIN", ipAddress: "127.0.0.1" };

  await store.publishLinkedNoticeDocument("notices", { id: "n1", status: "PUBLISHED", noticeType: "PDF", documentId: "doc-linked" } as { id: string }, audit, client);
  assert.equal(updates.length, 1, "exactly one document is updated");
  assert.deepEqual(updates[0], { where: { id: "doc-linked" }, data: { status: "PUBLISHED", updatedById: "user-iet-admin" } });
  assert.equal(documents.get("doc-linked")?.status, "PUBLISHED");
  assert.equal(documents.get("doc-unrelated")?.status, "DRAFT", "unrelated drafts are untouched");
  assert.equal(audits.length, 1, "the document change is audited");
  assert.equal(audits[0].entity, "documents");
  assert.equal(audits[0].entityId, "doc-linked");
  assert.equal(audits[0].action, "PUBLISHED_WITH_NOTICE");
  assert.equal(audits[0].ipAddress, "127.0.0.1");

  // Already published: nothing to do, nothing audited.
  await store.publishLinkedNoticeDocument("notices", { id: "n2", status: "PUBLISHED", noticeType: "PDF", documentId: "doc-live" } as { id: string }, audit, client);
  assert.equal(updates.length, 1);
  assert.equal(audits.length, 1);
  // Draft / text notices and missing documents: nothing happens.
  await store.publishLinkedNoticeDocument("notices", { id: "n3", status: "DRAFT", noticeType: "PDF", documentId: "doc-unrelated" } as { id: string }, audit, client);
  await store.publishLinkedNoticeDocument("notices", { id: "n4", status: "PUBLISHED", noticeType: "TEXT", documentId: "doc-unrelated" } as { id: string }, audit, client);
  await store.publishLinkedNoticeDocument("notices", { id: "n5", status: "PUBLISHED", noticeType: "PDF", documentId: "doc-missing" } as { id: string }, audit, client);
  assert.equal(updates.length, 1);
  assert.equal(documents.get("doc-unrelated")?.status, "DRAFT");
});

test("the notice transaction publishes the linked document after the notice itself is saved and audited", () => {
  const source = readFileSync(path.join(repoRoot, "lib/store.ts"), "utf8");
  const transaction = source.slice(source.indexOf("const saved = await prisma.$transaction(async (tx) => {"), source.indexOf("return savedRow;"));
  assert.match(transaction, /await upsertDatabaseEntity\(entity, payload, id, actorId, tx\)/);
  assert.match(transaction, /await appendAuditEntry\(tx, /);
  assert.match(transaction, /await publishLinkedNoticeDocument\(entity, savedRow, \{ user: actor, userId: actorId, role, ipAddress \}, tx\)/);
  assert.ok(transaction.indexOf("appendAuditEntry(tx") < transaction.indexOf("publishLinkedNoticeDocument("), "the document is published in the same transaction, after the notice");
  // The public notice query still only resolves a PDF when the document is published.
  assert.match(source, /item\.document && item\.document\.status === "PUBLISHED" && item\.document\.mimeType === "application\/pdf"/);
});

test("file-backed path: a published PDF notice makes its PDF public without a second approval; drafts stay hidden; unrelated documents stay drafts", async () => {
  const linked = await createDraftDocument("Semester examination schedule", DOCUMENT_KEY);
  const unrelated = await createDraftDocument("Unrelated draft circular", UNRELATED_KEY);
  assert.equal(linked.status, "DRAFT");
  assert.equal(unrelated.status, "DRAFT");

  // Draft PDF notice: neither the notice nor the PDF is public.
  const draft = await store.upsertEntity("notices", { title: "Examination schedule (draft)", noticeType: "PDF", documentId: String(linked.id), noticeDate: "2026-09-01", status: "DRAFT" }, ...actor) as Saved;
  let publicData = await store.getSiteData();
  assert.equal(publicData.notices.some((notice) => notice.id === draft.id), false, "a draft notice is not public");
  assert.equal(publicData.documents.some((doc) => doc.id === linked.id), false, "the PDF of a draft notice is not public");

  // Publishing the notice publishes its PDF at the same time.
  const published = await store.upsertEntity("notices", { title: "Examination schedule", noticeType: "PDF", documentId: String(linked.id), noticeDate: "2026-09-01", status: "PUBLISHED" }, actor[0], String(draft.id), actor[2], actor[3], actor[4]) as Saved;
  assert.equal(published.status, "PUBLISHED");
  const savedLinked = await storedDocument(linked.id);
  const savedUnrelated = await storedDocument(unrelated.id);
  assert.equal(savedLinked?.status, "PUBLISHED", "the linked PDF is published with the notice");
  assert.equal(savedUnrelated?.status, "DRAFT", "an unrelated document is never touched");

  publicData = await store.getSiteData();
  const publicNotice = publicData.notices.find((notice) => notice.id === published.id);
  assert.ok(publicNotice, "the published notice is public");
  assert.equal(publicNotice?.pdf?.url, `/api/media/${DOCUMENT_KEY}`, "the notice links to its PDF through the public media route");
  assert.equal(publicData.documents.some((doc) => doc.id === linked.id), true, "the PDF is available publicly");
  assert.equal(publicData.documents.some((doc) => doc.id === unrelated.id), false, "the unrelated draft stays hidden");
});

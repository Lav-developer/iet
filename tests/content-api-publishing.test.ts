import test, { before } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * End-to-end check of the content API's publishing authority: the real
 * POST/PATCH handlers run with a real signed session cookie against the
 * file-backed store in a private temporary directory (no database is
 * configured, so none is contacted). What is exercised is the production code
 * path: authentication, same-origin check, canAccess, the workflow decision
 * for the record's scope, payload validation, the store and the audit trail.
 *
 * Without a database the session is trusted from the signed token (the
 * development-only demo mode), which is how roles are simulated here; a
 * DEPARTMENT_ADMIN's department can then not be resolved, which the server must
 * treat as "no department" — nothing may be written or published.
 */

(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
// Development mode enables the demo session path; NODE_ENV is typed read-only, so it is set through the env record.
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
process.env.ALLOW_DEMO_AUTH = "true";
process.env.DEMO_ADMIN_EMAIL = "demo@iet.test";
process.env.DEMO_ADMIN_PASSWORD = "Demo-Passw0rd!";
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
delete process.env.DATABASE_URL;

type Role = "SUPER_ADMIN" | "IET_ADMIN" | "DEPARTMENT_ADMIN" | "EDITOR";
type Actor = { id: string; email: string; name: string; role: Role; departmentId?: string; sessionVersion: number };
type Saved = { id: string; status?: string; title?: string; departmentSlug?: string };

const EDITOR: Actor = { id: "u-editor", email: "editor@iet.test", name: "Editor", role: "EDITOR", sessionVersion: 0 };
const IET: Actor = { id: "u-iet", email: "iet@iet.test", name: "IET admin", role: "IET_ADMIN", sessionVersion: 0 };
const DEPT: Actor = { id: "u-dept", email: "dept@iet.test", name: "Department admin", role: "DEPARTMENT_ADMIN", departmentId: "dept-unresolvable", sessionVersion: 0 };

let handlers: { POST: (r: Request) => Promise<Response>; PATCH: (r: Request) => Promise<Response> };
let store: typeof import("../lib/store");
let issueSessionToken: (user: Actor) => Promise<string>;
let RequestCookies: new (headers: Headers) => unknown;
let workUnitAsyncStorage: { run<T>(store: unknown, fn: () => T): T };
let workAsyncStorage: { run<T>(store: unknown, fn: () => T): T };

before(async () => {
  // The file-backed store writes under process.cwd()/.data — never the repository's.
  process.chdir(mkdtempSync(path.join(tmpdir(), "iet-publishing-")));
  store = await import("../lib/store");
  handlers = await import("../app/api/admin/content/route");
  ({ issueSessionToken } = await import("../lib/auth"));
  ({ RequestCookies } = await import("next/dist/server/web/spec-extension/cookies"));
  ({ workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external"));
  ({ workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external"));
});

/** Runs a handler the way Next does: inside a request scope carrying the session cookie. */
async function call(actor: Actor | null, method: "POST" | "PATCH", body: unknown) {
  const cookieHeader = actor ? `iet_session=${await issueSessionToken(actor)}` : "";
  const request = new Request("http://localhost:3000/api/admin/content", {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
    body: JSON.stringify(body),
  });
  const unitStore = { type: "request", phase: "render", cookies: new RequestCookies(new Headers(cookieHeader ? { cookie: cookieHeader } : {})) };
  const workStore = { route: "/api/admin/content", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false };
  const response = await workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, () => handlers[method](request)));
  return { status: response.status, body: (await response.json()) as { error?: string; record?: Saved } };
}

// The admin editor always submits the whole form together with the chosen
// workflow status, so every request below carries a complete notice.
const notice = (title: string, status: string, extra: Record<string, unknown> = {}) => ({ title, summary: `${title} summary`, body: `${title} body`, noticeType: "TEXT", noticeDate: "2026-09-01", category: "General", status, ...extra });

async function stored(id: string): Promise<Saved | undefined> {
  const rows = (await store.getEntity("notices", true)) as Saved[];
  return rows.find((row) => row.id === id);
}
async function isPublic(id: string) {
  return (await store.getSiteData()).notices.some((row) => row.id === id);
}

test("unauthenticated requests are refused before anything else (401)", async () => {
  const { status } = await call(null, "POST", { entity: "notices", data: notice("Anonymous", "PUBLISHED") });
  assert.equal(status, 401);
});

test("EDITOR publishes within the editorial scope: a new notice goes live directly, and a draft is published without a review step", async () => {
  const created = await call(EDITOR, "POST", { entity: "notices", data: notice("Editor publishes directly", "PUBLISHED") });
  assert.equal(created.status, 201, created.body.error);
  assert.equal(created.body.record?.status, "PUBLISHED");
  assert.equal(await isPublic(created.body.record!.id), true, "published by the editor → on the public website");

  const draft = await call(EDITOR, "POST", { entity: "notices", data: notice("Editor draft", "DRAFT") });
  assert.equal(draft.status, 201, draft.body.error);
  assert.equal(await isPublic(draft.body.record!.id), false, "drafts are never public");
  const published = await call(EDITOR, "PATCH", { entity: "notices", id: draft.body.record!.id, data: notice("Editor draft", "PUBLISHED") });
  assert.equal(published.status, 200, published.body.error);
  assert.equal(published.body.record?.status, "PUBLISHED");
  assert.equal(await isPublic(draft.body.record!.id), true);

  // The audit trail names the editor for the publication.
  const audit = await store.getAuditEntries(1, 100);
  assert.ok(audit.logs.some((entry) => entry.entityId === draft.body.record!.id && entry.userId === EDITOR.id && entry.role === "EDITOR" && entry.action === "UPDATED"), "audit entry by the editor");
});

test("EDITOR edits a published notice and it stays published; unpublishing and archiving are refused with the reason", async () => {
  const created = await call(EDITOR, "POST", { entity: "notices", data: notice("Live notice", "PUBLISHED") });
  assert.equal(created.status, 201, created.body.error);
  const id = created.body.record!.id;

  const edited = await call(EDITOR, "PATCH", { entity: "notices", id, data: notice("Live notice (corrected)", "PUBLISHED") });
  assert.equal(edited.status, 200, edited.body.error);
  assert.equal(edited.body.record?.status, "PUBLISHED");
  assert.equal((await stored(id))?.title, "Live notice (corrected)");

  const unpublish = await call(EDITOR, "PATCH", { entity: "notices", id, data: notice("Live notice (corrected)", "DRAFT") });
  assert.equal(unpublish.status, 403);
  assert.match(unpublish.body.error || "", /Your role cannot unpublish a published record/);
  const archive = await call(EDITOR, "PATCH", { entity: "notices", id, data: notice("Live notice (corrected)", "ARCHIVED") });
  assert.equal(archive.status, 403);
  assert.match(archive.body.error || "", /Your role cannot archive records/);
  assert.equal((await stored(id))?.status, "PUBLISHED", "refusals change nothing");
  assert.equal(await isPublic(id), true);
});

test("IET_ADMIN unpublishes, archives and restores; an EDITOR cannot touch an archived record", async () => {
  const created = await call(EDITOR, "POST", { entity: "notices", data: notice("To be archived", "PUBLISHED") });
  const id = created.body.record!.id;

  const unpublished = await call(IET, "PATCH", { entity: "notices", id, data: notice("To be archived", "DRAFT") });
  assert.equal(unpublished.status, 200, unpublished.body.error);
  assert.equal(await isPublic(id), false, "unpublished → no longer public");
  const republished = await call(IET, "PATCH", { entity: "notices", id, data: notice("To be archived", "PUBLISHED") });
  assert.equal(republished.status, 200, republished.body.error);
  assert.equal(await isPublic(id), true);
  const archived = await call(IET, "PATCH", { entity: "notices", id, data: notice("To be archived", "ARCHIVED") });
  assert.equal(archived.status, 200, archived.body.error);
  assert.equal(await isPublic(id), false, "archived → not public");

  const editorEdit = await call(EDITOR, "PATCH", { entity: "notices", id, data: notice("Edited while archived", "ARCHIVED") });
  assert.equal(editorEdit.status, 403);
  assert.match(editorEdit.body.error || "", /This record is archived and cannot be changed/);
  const editorRestore = await call(EDITOR, "PATCH", { entity: "notices", id, data: notice("To be archived", "DRAFT") });
  assert.equal(editorRestore.status, 403);
  assert.equal((await stored(id))?.status, "ARCHIVED");
  assert.equal((await stored(id))?.title, "To be archived", "refusals change nothing");

  const restored = await call(IET, "PATCH", { entity: "notices", id, data: notice("To be archived", "DRAFT") });
  assert.equal(restored.status, 200, restored.body.error);
  assert.equal(restored.body.record?.status, "DRAFT");
});

test("no writer creates an archived record, and an unrecognised status value can never publish", async () => {
  for (const actor of [IET, EDITOR]) {
    const archived = await call(actor, "POST", { entity: "notices", data: notice("Born archived", "ARCHIVED") });
    assert.equal(archived.status, 403, actor.role);
    assert.match(archived.body.error || "", actor.role === "EDITOR" ? /Your role cannot archive records/ : /A new record cannot be created as archived/);
    const bogus = await call(actor, "POST", { entity: "notices", data: notice(`Bogus status ${actor.role}`, "LIVE") });
    assert.equal(bogus.status, 201, actor.role);
    assert.equal(bogus.body.record?.status, "DRAFT", "an unknown status is stored as a draft");
    assert.equal(await isPublic(bogus.body.record!.id), false);
  }
});

test("DEPARTMENT_ADMIN without a resolvable department (or on institution-wide content) cannot write or publish anything", async () => {
  const before = ((await store.getEntity("notices", true)) as Saved[]).length;
  const ownPublish = await call(DEPT, "POST", { entity: "notices", data: notice("Department publish", "PUBLISHED", { departmentSlug: "computer-science-engineering" }) });
  assert.equal(ownPublish.status, 403);
  const ownDraft = await call(DEPT, "POST", { entity: "notices", data: notice("Department draft", "DRAFT", { departmentSlug: "computer-science-engineering" }) });
  assert.equal(ownDraft.status, 403);
  const page = await call(DEPT, "POST", { entity: "pages", data: { title: "Institute page", slug: "institute-page", body: "x", locale: "en", status: "PUBLISHED" } });
  assert.equal(page.status, 403, "pages are not department-scoped");
  assert.equal(((await store.getEntity("notices", true)) as Saved[]).length, before, "nothing was created");
  // The editor's own published notice is not reachable for the department administrator either.
  const created = await call(EDITOR, "POST", { entity: "notices", data: notice("Institution-wide notice", "PUBLISHED") });
  const denied = await call(DEPT, "PATCH", { entity: "notices", id: created.body.record!.id, data: notice("Institution-wide notice", "DRAFT") });
  assert.equal(denied.status, 403);
  assert.equal((await stored(created.body.record!.id))?.status, "PUBLISHED");
});

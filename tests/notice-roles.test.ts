import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccess, entityCapability, validatePayload, visibleEntities, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";
import { describeStorageError, validateMagicBytes, validateUpload } from "../lib/storage";

const EDITOR: PolicyUser = { role: "EDITOR" };
const IET: PolicyUser = { role: "IET_ADMIN" };
const SUPER: PolicyUser = { role: "SUPER_ADMIN" };
const DEPT: PolicyUser = { role: "DEPARTMENT_ADMIN", departmentId: "dept-cse" };

const OWN = "computer-science-engineering";
const OTHER = "civil-engineering";
const draftNotice = (departmentSlug?: string) => ({ id: "notice-1", status: "DRAFT", ...(departmentSlug ? { departmentSlug } : {}) });

/** A real, minimal PDF file (starts with the %PDF- signature). */
const realPdf = () => Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "ascii");

test("all four CMS roles can create a text notice and see the section", () => {
  for (const [label, user] of [["SUPER_ADMIN", SUPER], ["IET_ADMIN", IET], ["EDITOR", EDITOR], ["DEPARTMENT_ADMIN", DEPT]] as const) {
    assert.equal(visibleEntities(user).some((capability) => capability.entity === "notices"), true, `${label} sees Notices`);
    const payload = label === "DEPARTMENT_ADMIN" ? { status: "DRAFT", departmentSlug: OWN, noticeType: "TEXT", body: "Holiday notice", title: "Holiday" } : { status: "DRAFT", noticeType: "TEXT", body: "Holiday notice", title: "Holiday" };
    assert.equal(canAccess(user, "notices", "write", payload, undefined, label === "DEPARTMENT_ADMIN" ? OWN : undefined), true, `${label} creates a text notice`);
    assert.equal(workflowTransitionAllowed(user, undefined, "DRAFT"), true, `${label} starts in DRAFT`);
    assert.doesNotThrow(() => validatePayload("notices", payload));
    assert.equal(entityCapability(user, "notices", label === "DEPARTMENT_ADMIN" ? OWN : undefined).canCreate, true, `${label} gets a create form`);
  }
});

test("a DEPARTMENT_ADMIN can only create and manage their own department's notice", () => {
  // Own department: allowed (draft and review workflows included).
  assert.equal(canAccess(DEPT, "notices", "write", { status: "DRAFT", departmentSlug: OWN }, undefined, OWN), true);
  assert.equal(canAccess(DEPT, "notices", "write", { status: "REVIEW", departmentSlug: OWN }, draftNotice(OWN), OWN), true);
  // Another department: refused for create, edit and delete alike.
  assert.equal(canAccess(DEPT, "notices", "write", { status: "DRAFT", departmentSlug: OTHER }, undefined, OWN), false);
  assert.equal(canAccess(DEPT, "notices", "write", { status: "REVIEW", departmentSlug: OWN }, draftNotice(OTHER), OWN), false);
  assert.equal(canAccess(DEPT, "notices", "delete", undefined, draftNotice(OWN), OWN), false);
  // No department scope at all: nothing.
  assert.equal(canAccess({ role: "DEPARTMENT_ADMIN" }, "notices", "write", { status: "DRAFT" }, undefined, OWN), false);
  // A department administrator publishes own-department notices directly, and
  // only those: never another department's, never without a resolvable department.
  const ownScope = { entity: "notices", departmentSlug: OWN, assignedDepartmentSlug: OWN } as const;
  assert.equal(canAccess(DEPT, "notices", "write", { status: "PUBLISHED", departmentSlug: OWN }, draftNotice(OWN), OWN), true);
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "REVIEW", departmentSlug: OWN }, "PUBLISHED", ownScope), true);
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "DRAFT", departmentSlug: OWN }, "PUBLISHED", ownScope), true);
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "PUBLISHED", departmentSlug: OWN }, "DRAFT", ownScope), true, "unpublish own");
  assert.equal(canAccess(DEPT, "notices", "write", { status: "PUBLISHED", departmentSlug: OTHER }, draftNotice(OTHER), OWN), false);
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "REVIEW", departmentSlug: OTHER }, "PUBLISHED", { ...ownScope, departmentSlug: OTHER }), false);
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "REVIEW", departmentSlug: OWN }, "PUBLISHED", { entity: "notices", departmentSlug: OWN }), false, "no resolvable department");
  assert.equal(workflowTransitionAllowed(DEPT, { id: "n", status: "REVIEW" }, "PUBLISHED"), false, "no record scope");
  assert.equal(workflowTransitionAllowed(IET, { id: "n", status: "REVIEW" }, "PUBLISHED"), true);
});

test("EDITOR notice permissions keep their existing scope (no delete, institution-wide), publish within it, and may edit a published notice", () => {
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "DRAFT" }, undefined, undefined), true);
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "REVIEW" }, draftNotice(), undefined), true);
  assert.equal(canAccess(EDITOR, "notices", "delete", undefined, draftNotice(), undefined), false);
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "PUBLISHED" }, draftNotice(), undefined), true, "an editor publishes within the editorial scope");
  assert.equal(workflowTransitionAllowed(EDITOR, draftNotice(), "PUBLISHED", { entity: "notices" }), true);
  assert.equal(workflowTransitionAllowed(EDITOR, draftNotice(), "PUBLISHED"), false, "no record scope, no delegated authority");
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "ARCHIVED" }, { id: "n", status: "PUBLISHED" }, undefined), false, "an editor cannot archive");
  // Editing authority is separate from publishing authority: a published
  // notice can be corrected by an editor, and stays published.
  assert.equal(canAccess(EDITOR, "notices", "write", undefined, { id: "n", status: "PUBLISHED" }, undefined), true);
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "PUBLISHED", title: "Corrected title" }, { id: "n", status: "PUBLISHED" }, undefined), true);
  assert.equal(canAccess(EDITOR, "notices", "write", { status: "DRAFT" }, { id: "n", status: "PUBLISHED" }, undefined), false, "an editor cannot unpublish");
});

test("the create form sends the value its select is displaying", () => {
  const editor = readFileSync("components/entity-manager.tsx", "utf8");
  const startNew = editor.slice(editor.indexOf("const startNew = ()"), editor.indexOf("const save = async"));
  assert.match(startNew, /field\.type === "select" \? field\.options\?\.\[0\] \|\| ""/, "a new record must initialise select fields to the option the browser shows");
  // The server accepts an empty select as "not provided" and defaults to TEXT.
  assert.doesNotThrow(() => validatePayload("notices", { title: "Holiday", noticeType: "", body: "Class cancelled." }));
  assert.doesNotThrow(() => validatePayload("notices", { title: "Holiday", body: "Class cancelled." }));
  assert.throws(() => validatePayload("notices", { title: "Holiday", noticeType: "POSTER", body: "Class cancelled." }), /TEXT or PDF/);
  // A notice written through this path is still a text notice and needs a body.
  assert.throws(() => validatePayload("notices", { title: "Holiday", noticeType: "", body: "" }), /requires a notice body/);
});

test("the notice editor never asks for a raw department id and fixes the department for a department administrator", () => {
  const editor = readFileSync("components/entity-manager.tsx", "utf8");
  // A department is chosen by name through the shared searchable selector…
  assert.match(editor, /key: "departmentSlug", label: "Department \(optional\)", type: "department"/);
  assert.match(editor, /Import-wide|Institute-wide \(no department\)/);
  assert.doesNotMatch(editor, /placeholder="department-slug"|label: "Department ID"/);
  // …and a scoped role gets the department from its own account, not from input.
  assert.match(editor, /capability\.fixedDepartmentSlug/);
  assert.match(readFileSync("lib/content-policy.ts", "utf8"), /fixedDepartmentSlug\?: string;/);
});

test("a valid PDF passes upload validation; fakes, wrong types and oversized files do not", () => {
  assert.doesNotThrow(() => validateUpload("application/pdf", 1024 * 1024, "documents"));
  assert.doesNotThrow(() => validateUpload("application/pdf", 25 * 1024 * 1024, "documents"));
  assert.equal(validateMagicBytes(realPdf(), "application/pdf"), true);
  // A renamed file is rejected on its bytes…
  assert.equal(validateMagicBytes(Buffer.from("<html>not a pdf</html>", "ascii"), "application/pdf"), false);
  assert.equal(validateMagicBytes(Buffer.from("MZ\u0000\u0000", "ascii"), "application/pdf"), false);
  // …an executable is rejected on its declared type…
  assert.throws(() => validateUpload("application/x-msdownload", 1024, "documents"), /Only PDF documents are allowed/);
  assert.throws(() => validateUpload("image/png", 1024, "documents"), /Only PDF documents are allowed/);
  // …and anything over the document limit is refused.
  assert.throws(() => validateUpload("application/pdf", 25 * 1024 * 1024 + 1, "documents"), /too large/);
});

test("object storage failures produce safe, actionable messages instead of a bare 500", () => {
  const access = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
  assert.deepEqual(describeStorageError(access), { status: 503, message: "Object storage rejected the upload. Check STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY." });
  assert.equal(describeStorageError(Object.assign(new Error("x"), { name: "NoSuchBucket" })).status, 503);
  assert.equal(describeStorageError(new Error("Object storage configuration is incomplete.")).status, 503);
  assert.deepEqual(describeStorageError(new Error("socket hang up")), { status: 502, message: "The upload service is temporarily unavailable. Please try again in a moment." });
  // No message may leak a credential value or a filesystem path (naming the
  // variables an operator must check is the point of the message).
  for (const error of [access, new Error("Object storage configuration is incomplete."), new Error("socket hang up")]) {
    const { message } = describeStorageError(error);
    assert.doesNotMatch(message, /\/home\/|\/var\/|node_modules|passwordHash|AKIA[0-9A-Z]{8,}/);
    const secretValue = process.env.STORAGE_SECRET_KEY;
    if (secretValue) assert.equal(message.includes(secretValue), false, "the storage secret never reaches a response");
  }
});

test("server-side encryption is opt-in, because Cloudflare R2 rejects the SSE header", () => {
  const storage = readFileSync("lib/storage.ts", "utf8");
  assert.match(storage, /function serverSideEncryption\(\): "AES256" \| "aws:kms" \| undefined/);
  assert.match(storage, /\(encryption \? \{ ServerSideEncryption: encryption \} : \{\}\)/);
  assert.doesNotMatch(storage, /ServerSideEncryption: "AES256",/);
  assert.match(storage, /STORAGE_SERVER_SIDE_ENCRYPTION/);
  // The header is only ever added for an explicit opt-in.
  const previous = process.env.STORAGE_SERVER_SIDE_ENCRYPTION;
  process.env.STORAGE_SERVER_SIDE_ENCRYPTION = "AES256";
  const configured = storage.match(/const configured = process\.env\.STORAGE_SERVER_SIDE_ENCRYPTION\?\.trim\(\);\n\s*return configured === "AES256" \|\| configured === "aws:kms" \? configured : undefined;/);
  assert.ok(configured, "opt-in is validated against the supported algorithms");
  if (previous === undefined) delete process.env.STORAGE_SERVER_SIDE_ENCRYPTION; else process.env.STORAGE_SERVER_SIDE_ENCRYPTION = previous;
});

test("the upload endpoint uses the shared pipeline for notices too, with cleanup on failure", () => {
  const route = readFileSync("app/api/admin/media/upload/route.ts", "utf8");
  assert.match(route, /randomObjectKey\(collection, file\.name\)/);
  assert.match(route, /validateMagicBytes\(buffer, file\.type\)/);
  assert.match(route, /await deleteObject\(stored\.key\)\.catch/, "a failed metadata write does not orphan the object");
  assert.match(route, /describeStorageError\(error\)/);
  // Only PDFs reach the document pipeline, and only through this endpoint.
  assert.match(route, /const collection = form\.get\("collection"\) === "documents" \? "documents" : "media"/);
  assert.match(route, /upsertEntity\("documents"/);
  const editor = readFileSync("components/entity-manager.tsx", "utf8");
  assert.match(editor, /accept=\{collection === "media" \? "image\/png,image\/jpeg,image\/webp,image\/gif" : "application\/pdf"\}/);
  // A department administrator's upload carries their assigned department.
  assert.match(editor, /form\.append\("departmentSlug", departmentSlug\)/);
});

test("a workflow-only update is validated against the resulting record, not the fragment", () => {
  const route = readFileSync("app/api/admin/content/route.ts", "utf8");
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  assert.match(patch, /const current = \(await getSingleEntityRecord\(entity, body\.id\)\)/);
  assert.match(patch, /validatePayload\(entity, \{ \.\.\.current, \.\.\.data \}\)/, "the merged record is what gets validated");
  assert.doesNotMatch(patch, /validatePayload\(entity, data\)/, "validating the fragment alone broke status-only transitions");
  // A status-only payload is exactly what a review/publish action sends.
  assert.doesNotThrow(() => validatePayload("notices", { id: "n", title: "Holiday", noticeType: "PDF", documentId: "doc-1", status: "REVIEW" }));
});

test("a PDF notice requires a document and a text notice requires a body", () => {
  assert.throws(() => validatePayload("notices", { title: "Cancelled", noticeType: "PDF" }), /requires an uploaded PDF document/);
  assert.throws(() => validatePayload("notices", { title: "Cancelled", noticeType: "TEXT" }), /requires a notice body/);
  assert.doesNotThrow(() => validatePayload("notices", { title: "Cancelled", noticeType: "TEXT", body: "Class cancelled." }));
  assert.doesNotThrow(() => validatePayload("notices", { title: "Cancelled", noticeType: "PDF", documentId: "doc-1" }));
  assert.throws(() => validatePayload("notices", { title: "Cancelled", noticeType: "PDF", documentId: "doc-1", noticeDate: "2026-05-10", expiryDate: "2026-05-01" }), /expiry date cannot be before/);
});

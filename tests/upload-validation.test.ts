import test from "node:test";
import assert from "node:assert/strict";
import { validateUpload, validateMagicBytes } from "../lib/storage";
import { POST } from "../app/api/admin/media/upload/route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF87 = Buffer.from("GIF87a...");
const GIF89 = Buffer.from("GIF89a...");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
const PDF = Buffer.from("%PDF-1.4 ...");
const GARBAGE = Buffer.from("this is definitely not an image at all");

test("validateUpload: media accepts only the four image types", () => {
  for (const ok of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert.doesNotThrow(() => validateUpload(ok, 1024, "media"), ok);
  }
  for (const bad of ["application/pdf", "image/svg+xml", "text/html", "image/tiff", "application/zip"]) {
    assert.throws(() => validateUpload(bad, 1024, "media"), /Only PNG, JPEG, WebP or GIF images are allowed\./, bad);
  }
});

test("validateUpload: documents accept only PDF", () => {
  assert.doesNotThrow(() => validateUpload("application/pdf", 1024, "documents"));
  for (const bad of ["image/png", "application/msword", "application/x-zip-compressed"]) {
    assert.throws(() => validateUpload(bad, 1024, "documents"), /Only PDF documents are allowed\./, bad);
  }
});

test("validateUpload: size limits are enforced per collection (10 MB media / 25 MB documents)", () => {
  const mb = 1024 * 1024;
  assert.doesNotThrow(() => validateUpload("image/png", 10 * mb, "media"));
  assert.throws(() => validateUpload("image/png", 10 * mb + 1, "media"), /File is too large/);
  assert.doesNotThrow(() => validateUpload("application/pdf", 25 * mb, "documents"));
  assert.throws(() => validateUpload("application/pdf", 25 * mb + 1, "documents"), /File is too large/);
});

test("validateMagicBytes: content must match the declared type", () => {
  assert.equal(validateMagicBytes(PNG, "image/png"), true);
  assert.equal(validateMagicBytes(GIF87, "image/gif"), true);
  assert.equal(validateMagicBytes(GIF89, "image/gif"), true);
  assert.equal(validateMagicBytes(JPEG, "image/jpeg"), true);
  assert.equal(validateMagicBytes(WEBP, "image/webp"), true);
  assert.equal(validateMagicBytes(PDF, "application/pdf"), true);

  // Mismatched content: a PNG body declared as GIF must be rejected — this is
  // what stops a disguised executable/polyglot from being stored.
  assert.equal(validateMagicBytes(PNG, "image/gif"), false, "PNG bytes as GIF");
  assert.equal(validateMagicBytes(PNG, "image/jpeg"), false, "PNG bytes as JPEG");
  assert.equal(validateMagicBytes(PDF, "image/png"), false, "PDF bytes as PNG");
  assert.equal(validateMagicBytes(GARBAGE, "image/png"), false, "garbage as PNG");
  assert.equal(validateMagicBytes(GARBAGE, "application/pdf"), false, "garbage as PDF");
  // Unknown declared type: never passes.
  assert.equal(validateMagicBytes(PNG, "image/tiff"), false, "unknown declared type");
  // Too short to contain the signature.
  assert.equal(validateMagicBytes(Buffer.from([0x89, 0x50]), "image/png"), false, "truncated PNG header");
});

// NOTE: the unauthenticated path of the upload route (requireAdmin → 401)
// calls next/headers' cookies(), which requires Next's request scope. It is
// therefore exercised in the Phase 6 server smoke test (real HTTP request),
// not headlessly here. Everything that runs BEFORE cookie access is covered
// below.

test("upload route: cross-origin request is rejected with 403", async () => {
  const res = await POST(
    new Request("http://app.test/api/admin/media/upload", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "app.test" },
      body: new FormData(),
    }),
  );
  assert.equal(res.status, 403);
});

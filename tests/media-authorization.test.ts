import test from "node:test";
import assert from "node:assert/strict";
import { resolveMediaDelivery } from "../lib/media-policy";
import type { MediaCandidate, DocumentCandidate } from "../lib/media-policy";
import { sanitize } from "../lib/content-policy";

const media = (key: string, mimeType: string): MediaCandidate => ({ key, mimeType });
const document = (key: string, status: string, mimeType = "application/pdf"): DocumentCandidate => ({ key, mimeType, status });

const KEY = "documents/2026/12345678-1234-4abc-8def-123456789abc.pdf";

test("a) a PUBLISHED document is publicly served", () => {
  const decision = resolveMediaDelivery(null, document(KEY, "PUBLISHED"));
  assert.equal(decision.serve, true);
  if (decision.serve) {
    assert.equal(decision.isDocument, true);
    assert.equal(decision.record.key, KEY);
    assert.equal(decision.record.mimeType, "application/pdf");
  }
});

test("b) a DRAFT document is NOT served (404), even with a PUBLISHED status on a same-key media row", () => {
  assert.equal(resolveMediaDelivery(null, document(KEY, "DRAFT")).serve, false);
  assert.equal(resolveMediaDelivery(null, document(KEY, "REVIEW")).serve, false);
  assert.equal(resolveMediaDelivery(null, document(KEY, "ARCHIVED")).serve, false);
  // Document precedence: a PUBLISHED media row cannot rescue a draft document.
  const shadowed = resolveMediaDelivery({ key: "media/2026/12345678-1234-4abc-8def-123456789abc.png", mimeType: "image/png" }, document(KEY, "DRAFT"));
  assert.equal(shadowed.serve, false);
  if (!shadowed.serve) assert.equal(shadowed.reason, "unpublished-document");
});

test("c) an editor cannot create a media record shadowing a document (key pattern + MIME restricted at the source)", () => {
  // A document key is rejected when used as a media key.
  assert.throws(
    () => sanitize("media", { key: KEY }),
    /INVALID_INPUT: Media key must reference an object from the media storage collection\./,
  );
  // A media key is rejected when used as a document key.
  const MEDIA_KEY = "media/2026/12345678-1234-4abc-8def-123456789abc.png";
  assert.throws(() => sanitize("documents", { key: MEDIA_KEY }), /INVALID_INPUT: Document key must reference an object from the documents storage collection\./);
  // Caller-chosen paths never pass.
  for (const bad of ["media/2026/../../etc/passwd.png", "media/2026/not-a-uuid.png", "other/2026/12345678-1234-4abc-8def-123456789abc.png", "documents/2026/UPPER.pdf"]) {
    assert.throws(() => sanitize("media", { key: bad }), /INVALID_INPUT/, `media key ${bad}`);
    assert.throws(() => sanitize("documents", { key: bad }), /INVALID_INPUT/, `document key ${bad}`);
  }
  // An empty key means "no key change" and is accepted for either entity.
  assert.doesNotThrow(() => sanitize("media", { key: "" }));
  assert.doesNotThrow(() => sanitize("documents", { key: "" }));
  // Media records may only carry approved image MIME types.
  for (const badMime of ["application/pdf", "image/svg+xml", "text/html", "image/tiff"]) {
    assert.throws(() => sanitize("media", { key: MEDIA_KEY, mimeType: badMime }), /INVALID_INPUT: Media MIME type must be an approved image type\./, `media mime ${badMime}`);
  }
  // Document records may only be application/pdf.
  assert.throws(() => sanitize("documents", { key: KEY, mimeType: "image/png" }), /INVALID_INPUT: Document MIME type must be application\/pdf\./);
  // A conforming media key is accepted and its URL is derived from the key (never caller-chosen).
  const ok = sanitize("media", { key: MEDIA_KEY, url: "/evil" });
  assert.equal(ok.url, `/api/media/${MEDIA_KEY.split("/").map(encodeURIComponent).join("/")}`);
  const okDoc = sanitize("documents", { key: KEY, url: "/evil" });
  assert.equal(okDoc.url, `/api/media/${KEY.split("/").map(encodeURIComponent).join("/")}`);
});

test("d) an unknown key and disallowed MIME types resolve to not-found", () => {
  assert.deepEqual(resolveMediaDelivery(null, null), { serve: false, reason: "not-found" });
  // A media row with a non-image MIME type is not served.
  for (const badMime of ["image/svg+xml", "application/pdf", "text/html"]) {
    const decision = resolveMediaDelivery({ key: "media/2026/12345678-1234-4abc-8def-123456789abc.png", mimeType: badMime }, null);
    assert.equal(decision.serve, false, badMime);
    if (!decision.serve) assert.equal(decision.reason, "disallowed-mime-type");
  }
  // A media row with an approved image MIME type is served as a plain image.
  for (const okMime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    const decision = resolveMediaDelivery({ key: "media/2026/12345678-1234-4abc-8def-123456789abc.png", mimeType: okMime }, null);
    assert.equal(decision.serve, true, okMime);
  }
  // A non-PDF published document is not served (e.g. a legacy row).
  const decision = resolveMediaDelivery(null, { key: KEY, mimeType: "image/svg+xml", status: "PUBLISHED" });
  assert.equal(decision.serve, false);
  if (!decision.serve) assert.equal(decision.reason, "disallowed-mime-type");
});

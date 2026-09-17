/**
 * Public media/document delivery decision. Pure function so the exact
 * authorization rules can be exercised behaviorally in tests:
 *
 * 1. A Document record ALWAYS takes precedence over a Media record when the
 *    storage key matches — a media record can never shadow a document.
 * 2. A Document is publicly served only when its status is PUBLISHED.
 * 3. A Media record is served only with an approved image MIME type.
 * 4. Unknown keys / disallowed MIME types → 404.
 */

export const MEDIA_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const DOCUMENT_MIME_TYPE = "application/pdf";

export type MediaCandidate = { key: string; mimeType: string };
export type DocumentCandidate = { key: string; mimeType: string; status: string; title?: string | null };

export type DeliveryDecision =
  | { serve: false; reason: "not-found" | "unpublished-document" | "disallowed-mime-type" }
  | { serve: true; record: { key: string; mimeType: string; title?: string | null }; isDocument: boolean };

export function resolveMediaDelivery(media: MediaCandidate | null, document: DocumentCandidate | null): DeliveryDecision {
  // Document precedence: whenever a Document row exists for the key it is the
  // authoritative record for that object, regardless of any Media row.
  if (document) {
    if (document.status !== "PUBLISHED") return { serve: false, reason: "unpublished-document" };
    if (document.mimeType !== DOCUMENT_MIME_TYPE) return { serve: false, reason: "disallowed-mime-type" };
    return { serve: true, record: { key: document.key, mimeType: document.mimeType, title: document.title ?? undefined }, isDocument: true };
  }
  if (media) {
    if (!MEDIA_IMAGE_MIME_TYPES.has(media.mimeType)) return { serve: false, reason: "disallowed-mime-type" };
    return { serve: true, record: { key: media.key, mimeType: media.mimeType, title: undefined }, isDocument: false };
  }
  return { serve: false, reason: "not-found" };
}

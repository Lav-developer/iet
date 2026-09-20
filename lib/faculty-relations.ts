import { type PolicyUser } from "@/lib/content-policy";
import type { EntityName } from "@/lib/types";
import { MEDIA_IMAGE_MIME_TYPES } from "@/lib/media-policy";

/** Relationships never change the target's publication status or delivery policy. */
export async function validateAssetRelations(
  user: PolicyUser, entity: EntityName, payload: Record<string, unknown>,
  lookup: (entity: EntityName, id: string) => Promise<unknown>, assignedDepartmentSlug?: string,
  current?: Record<string, unknown>,
) {
  // Every relationship selectable from the CMS is listed here, so an asset that
  // belongs to another department can never be attached through a direct call
  // even when the record itself is inside the caller's scope (a notice with a
  // PDF from a different department was previously accepted).
  const relations = entity === "faculty"
    ? [["profileImageId", "media"], ["cvDocumentId", "documents"]] as const
    : entity === "events" ? [["organizationId", "organizations"]] as const
    : entity === "notices" ? [["documentId", "documents"]] as const : [];
  for (const [key, target] of relations) {
    if (!payload[key] || payload[key] === current?.[key]) continue;
    const row = await lookup(target, String(payload[key])) as Record<string, unknown> | null;
    // Match the library GET's read scope, not its write/workflow restrictions.
    // Selecting a published PDF must not require permission to edit that PDF.
    const inScope = user.role !== "DEPARTMENT_ADMIN" || (target !== "media" && Boolean(user.departmentId) && Boolean(assignedDepartmentSlug) && row?.departmentSlug === assignedDepartmentSlug);
    if (!row || !inScope) throw new Error(`INVALID_INPUT: Select an accessible ${target} record.`);
    if (target === "media" && !MEDIA_IMAGE_MIME_TYPES.has(String(row.mimeType))) throw new Error("INVALID_INPUT: Profile photograph must be an image.");
    if (target === "documents" && row.mimeType !== "application/pdf") throw new Error("INVALID_INPUT: The selected PDF document is required for this record.");
  }
}

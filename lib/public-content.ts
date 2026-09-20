import type { DepartmentContact, FacultyMember, SiteData } from "@/lib/types";
import { isDocumentCollectionKey, isMediaCollectionKey } from "@/lib/content-policy";
import { MEDIA_IMAGE_MIME_TYPES } from "@/lib/media-policy";

export function safeExternalUrl(value?: string | null, httpsOnly = false): string | undefined {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!(httpsOnly ? ["https:"] : ["https:", "http:"]).includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

/**
 * A department's configured contact, resolved to the person who holds it.
 * `role` is the responsibility the department configured for that person.
 */
export type DepartmentContactDisplay = {
  id: string;
  role: string;
  person: FacultyMember;
};

/**
 * Resolves a department's **explicitly configured** contacts (see the
 * DepartmentContact model) to the people who hold them.
 *
 * - The person is looked up by the slug the department configured, so the name,
 *   designation, email and phone shown always belong to that person.
 * - A contact whose person is unpublished, removed, or no longer in the
 *   department is skipped rather than replaced by anybody else.
 * - Ordering comes from the configured order (then role, then name) — never
 *   from the order the faculty query happened to return.
 * - No configured contact yields an empty list: the public card then shows the
 *   "not available" fallback instead of presenting the first faculty row as the
 *   department's contact.
 */
export function departmentContacts(
  department: { slug: string; contacts?: DepartmentContact[] } | undefined,
  faculty: FacultyMember[],
): DepartmentContactDisplay[] {
  if (!department?.contacts?.length) return [];
  const bySlug = new Map(faculty.filter((person) => person.status === "PUBLISHED" && person.departmentSlug === department.slug).map((person) => [person.slug, person]));
  const seen = new Set<string>();
  return department.contacts
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.role.localeCompare(b.role, "en") || a.facultySlug.localeCompare(b.facultySlug, "en"))
    .flatMap((contact) => {
      const person = bySlug.get(contact.facultySlug);
      if (!person || seen.has(person.id)) return [];
      seen.add(person.id);
      return [{ id: contact.id || `${contact.role}-${person.slug}`, role: contact.role, person }];
    });
}

export function mediaDeliveryUrl(key: string) {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function facultyAssets(person: FacultyMember, data: Pick<SiteData, "media" | "documents">) {
  const photo = data.media.find((item) => item.id === person.profileImageId && isMediaCollectionKey(item.key) && MEDIA_IMAGE_MIME_TYPES.has(item.mimeType));
  const document = data.documents.find((item) => item.id === person.cvDocumentId && item.status === "PUBLISHED" && item.mimeType === "application/pdf" && isDocumentCollectionKey(item.key));
  const external = safeExternalUrl(person.cvUrl, true);
  return {
    profileImage: photo ? { url: mediaDeliveryUrl(photo.key), altText: photo.altText || `Portrait of ${person.name}` } : undefined,
    cv: external ? { url: external, external: true } : document ? { url: mediaDeliveryUrl(document.key), external: false } : undefined,
  };
}

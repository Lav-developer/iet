import type { FacultyMember, SiteData } from "@/lib/types";
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

export function selectDepartmentContact(faculty: FacultyMember[], departmentSlug: string) {
  const people = faculty.filter((person) => person.status === "PUBLISHED" && person.departmentSlug === departmentSlug && !["LABORATORY STAFF", "NON-TEACHING STAFF"].includes(person.type || ""));
  // Multiple coordinators use name, then slug/id as a stable tie-breaker.
  // Sort a copy: the faculty directory's ordering must remain unchanged.
  const coordinators = people.filter((person) => /\(coordinator\)/i.test(person.designation))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en") || a.id.localeCompare(b.id, "en"));
  return { person: coordinators[0] || people[0], label: coordinators.length ? "Department Coordinator" : "Department Contact" };
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

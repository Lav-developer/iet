import type { FacultyMember, SiteData } from "@/lib/types";

const roleLabels: Record<string, string> = {
  FACULTY: "Faculty",
  LEADERSHIP: "Leadership",
  "LABORATORY STAFF": "Laboratory staff",
  "NON-TEACHING STAFF": "Non-teaching staff",
};

const published = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === "PUBLISHED");
const references = (values: string[] | undefined, item: { id: string; slug: string }) =>
  Boolean(values?.includes(item.slug) || values?.includes(item.id));
const recipientName = (value: string) => value.trim().toLocaleLowerCase("en");

/**
 * Resolve only existing public information. Relationship arrays normally contain
 * slugs, but older records may contain IDs (including publication authors).
 * Never infer faculty relationships from a shared department or research topic.
 */
export function facultyProfileContent(person: FacultyMember, data: SiteData) {
  const type = person.type?.trim();
  const name = recipientName(person.name);
  // Achievement has a recipient field, not a faculty FK. Only an exact,
  // unambiguous full-name recipient is attributable to this person; do not
  // match substrings, aliases, team names or department-wide achievements.
  const uniqueRecipient = Boolean(name) && published(data.faculty).filter((item) => recipientName(item.name) === name).length === 1;

  return {
    designation: person.designation?.trim(),
    qualification: person.qualification?.trim(),
    roleType: type ? roleLabels[type] || type : undefined,
    biography: person.profile?.trim(),
    interests: (person.researchInterests || []).map((interest) => interest.trim()).filter(Boolean),
    department: published(data.departments).find((item) => item.slug === person.departmentSlug),
    areas: published(data.researchAreas).filter((item) => references(item.facultySlugs, person) || references(person.researchAreaSlugs, item)),
    laboratories: published(data.laboratories).filter((item) => references(person.laboratorySlugs, item)),
    projects: published(data.projects).filter((item) => references(item.facultySlugs, person)),
    publications: published(data.publications).filter((item) => references(item.authorSlugs, person)),
    achievements: uniqueRecipient ? published(data.achievements).filter((item) => item.recipient && recipientName(item.recipient) === name) : [],
    email: person.email?.trim(),
    phone: person.phone?.trim(),
  };
}

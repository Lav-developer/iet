import Link from "next/link";
import { safeExternalUrl } from "@/lib/public-content";
import type { EventItem, Project, Publication, StudentOrganization } from "@/lib/types";

export function OrganizationCard({ organization }: { organization: StudentOrganization }) {
  return <Link className="data-card" href={`/organizations/${organization.slug}`}><h3>{organization.name}</h3><p>{organization.description}</p><span className="link-arrow">Explore organization</span></Link>;
}

export function EventCard({ event }: { event: EventItem }) {
  const registration = safeExternalUrl(event.registrationUrl);
  return <article className="data-card" id={event.slug}>
    <h3>{event.title}</h3><p>{event.summary}</p>
    {event.startsAt && <p className="small"><time dateTime={new Date(event.startsAt).toISOString()}>{new Date(event.startsAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</time>{event.endsAt && <> – <time dateTime={new Date(event.endsAt).toISOString()}>{new Date(event.endsAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}</time></>}</p>}
    {event.location && <p className="small">{event.location}</p>}
    {registration && <a href={registration} target="_blank" rel="noopener noreferrer" className="link-arrow">Registration (opens in a new tab)</a>}
  </article>;
}

export function ProjectCard({ project }: { project: Project }) {
  return <article className="data-card" id={project.slug}><h3>{project.title}</h3><p>{project.summary}</p>{project.sponsor && <p className="small">Sponsor: {project.sponsor}</p>}{project.departmentSlug && <Link className="link-arrow" href={`/departments/${project.departmentSlug}`}>{project.departmentName || "Department"}</Link>}</article>;
}

export function PublicationCard({ publication }: { publication: Publication }) {
  const url = safeExternalUrl(publication.url) || (publication.doi && /^10\.\d{4,9}\//.test(publication.doi) ? `https://doi.org/${encodeURI(publication.doi)}` : undefined);
  return <article className="data-card" id={publication.slug}><h3>{publication.title}</h3>{(publication.venue || publication.year) && <p>{[publication.venue, publication.year].filter(Boolean).join(" · ")}</p>}{publication.abstract && <p>{publication.abstract}</p>}{url && <a className="link-arrow" href={url} target="_blank" rel="noopener noreferrer">View publication (opens in a new tab)</a>}</article>;
}

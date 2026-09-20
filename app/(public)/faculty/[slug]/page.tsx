import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, PageHeader, SectionHeading } from "@/components/ui";
import { ProjectCard, PublicationCard } from "@/components/content-cards";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getSiteData();
  const person = data.faculty.find((item) => item.slug === slug);
  return { title: person?.name || "Profile not found", description: person ? `${person.name}, ${person.designation} at IET-DSMNRU.` : undefined };
}
export default async function FacultyProfilePage({ params }: Props) {
  const { slug } = await params;
  const data = await getSiteData();
  const person = data.faculty.find((item) => item.slug === slug);
  if (!person) notFound();
  const department = data.departments.find((item) => item.slug === person.departmentSlug);
  const areas = data.researchAreas.filter((item) => item.facultySlugs?.includes(person.slug) || person.researchAreaSlugs?.includes(item.slug));
  const labs = data.laboratories.filter((item) => person.laboratorySlugs?.includes(item.slug));
  const projects = data.projects.filter((item) => item.facultySlugs?.includes(person.slug));
  const publications = data.publications.filter((item) => item.authorSlugs?.includes(person.slug));
  return <>
    <PageHeader eyebrow="Faculty & staff" title={person.name} description={person.designation} breadcrumbs={[{ label: "Faculty & staff", href: "/faculty" }, { label: person.name }]} />
    <section className="section"><div className="container detail-layout faculty-profile-layout"><div>
      <section className="detail-section"><Avatar name={person.name} image={person.profileImage} />{person.profile && <p className="lead" style={{ marginTop: 24, whiteSpace: "pre-line" }}>{person.profile}</p>}
        {person.qualification && <><h2>Qualification</h2><p>{person.qualification}</p></>}
      </section>
      {!!person.researchInterests?.length && <section className="detail-section"><h2>Research interests</h2><ul>{person.researchInterests.map((interest) => <li key={interest}>{interest}</li>)}</ul></section>}
      {areas.length > 0 && <section className="detail-section"><h2>Research areas</h2><div className="cta-row">{areas.map((area) => <Link className="tag" href={`/research#${area.slug}`} key={area.id}>{area.name}</Link>)}</div></section>}
      {labs.length > 0 && <section className="detail-section"><h2>Laboratories</h2><div className="cta-row">{labs.map((lab) => <Link className="link-arrow" href={`/laboratories/${lab.slug}`} key={lab.id}>{lab.name}</Link>)}</div></section>}
      {projects.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Research" title="Projects" /><div className="data-grid">{projects.map((project) => <ProjectCard project={project} key={project.id} />)}</div></section>}
      {publications.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Scholarship" title="Publications" /><div className="data-grid">{publications.map((publication) => <PublicationCard publication={publication} key={publication.id} />)}</div></section>}
    </div><aside className="info-aside">
      {department && <div className="aside-card"><h2>Department</h2><Link className="link-arrow" href={`/departments/${department.slug}`}>{department.name}</Link></div>}
      <div className="aside-card"><h2>Contact</h2>{person.email && <a className="contact-line" href={`mailto:${person.email}`}>{person.email}</a>}{person.phone && <a className="contact-line" href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>{person.phone}</a>}{!person.email && !person.phone && <Link className="link-arrow" href="/contact">Institute contact</Link>}</div>
      {person.cv && <a className="button" href={person.cv.url} target={person.cv.external ? "_blank" : undefined} rel={person.cv.external ? "noopener noreferrer" : undefined}>{person.cv.external ? "View CV" : "Download CV (PDF)"}{person.cv.external && <span className="sr-only"> (opens in a new tab)</span>}</a>}
      <Link className="link-arrow" href="/faculty">Back to Faculty &amp; staff</Link>
    </aside></div></section>
  </>;
}

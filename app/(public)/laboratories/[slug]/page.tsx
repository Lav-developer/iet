import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { ProjectCard } from "@/components/content-cards";
import { getSiteData } from "@/lib/store";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params; const data = await getSiteData(); const lab = data.laboratories.find((item) => item.slug === slug);
  return { title: lab?.name || "Laboratory not found", description: lab?.description };
}
export default async function LaboratoryPage({ params }: Props) {
  const { slug } = await params; const data = await getSiteData(); const lab = data.laboratories.find((item) => item.slug === slug);
  if (!lab) notFound();
  const department = data.departments.find((item) => item.slug === lab.departmentSlug);
  const people = data.faculty.filter((item) => item.laboratorySlugs?.includes(lab.slug));
  const programs = data.programs.filter((item) => item.laboratorySlugs?.includes(lab.slug));
  const projects = data.projects.filter((item) => item.laboratorySlugs?.includes(lab.slug));
  const details = [["Equipment", lab.equipment], ["Courses supported", lab.courses], ["Research relevance", lab.researchRelevance]].filter(([, value]) => value);
  return <><PageHeader eyebrow="Facilities" title={lab.name} description={lab.description} breadcrumbs={[{ label: "Laboratories", href: "/laboratories" }, { label: lab.name }]} />
    <section className="section"><div className="container detail-layout"><div>
      {details.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Facilities" title="Laboratory information" /><div className="data-grid">{details.map(([label, value]) => <div className="data-card" key={label}><h3>{label}</h3><p style={{ whiteSpace: "pre-line" }}>{value}</p></div>)}</div></section>}
      {people.length > 0 && <section className="detail-section"><h2>Faculty &amp; staff</h2><div className="data-grid">{people.map((person) => <Link href={`/faculty/${person.slug}`} className="data-card" key={person.id}><h3>{person.name}</h3><p>{person.designation}</p><span className="link-arrow">Open profile</span></Link>)}</div></section>}
      {programs.length > 0 && <section className="detail-section"><h2>Programmes</h2><div className="cta-row">{programs.map((program) => <Link className="link-arrow" href={`/programs/${program.slug}`} key={program.id}>{program.title}</Link>)}</div></section>}
      {projects.length > 0 && <section className="detail-section"><h2>Projects</h2><div className="data-grid">{projects.map((project) => <ProjectCard project={project} key={project.id} />)}</div></section>}
      {!details.length && !people.length && !programs.length && !projects.length && <EmptyState title="More laboratory information will be added here" />}
    </div><aside className="info-aside">{department && <div className="aside-card"><h2>Department</h2><Link href={`/departments/${department.slug}`} className="link-arrow">{department.name}</Link></div>}<Link href="/laboratories" className="link-arrow">Back to Laboratories</Link></aside></div></section></>;
}

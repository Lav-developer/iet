import Link from "next/link";
import { EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Research & innovation", description: "Research areas, faculty expertise, projects and publications at IET-DSMNRU." };
export default async function ResearchPage() {
  const data = await getSiteData();
  return <><PageHeader eyebrow="Research & innovation" title="Research at IET" description="Explore research areas and the people, facilities and projects behind them." breadcrumbs={[{ label: "Research" }]} />
    <section className="section"><div className="container"><SectionHeading eyebrow="Expertise" title="Research areas" />
      {data.researchAreas.length ? <div className="data-grid">{data.researchAreas.map((area) => {
        const people = data.faculty.filter((person) => area.facultySlugs?.includes(person.slug) || person.researchAreaSlugs?.includes(area.slug));
        const departments = data.departments.filter((department) => area.departmentSlugs?.includes(department.slug));
        return <article className="data-card" id={area.slug} key={area.id}><h3>{area.name}</h3><p>{area.description}</p><div className="cta-row">{departments.map((department) => <Link className="tag" href={`/departments/${department.slug}`} key={department.id}>{department.shortName || department.name}</Link>)}</div><div className="cta-row">{people.map((person) => <Link className="link-arrow" href={`/faculty/${person.slug}`} key={person.id}>{person.name}</Link>)}</div></article>;
      })}</div> : <EmptyState title="No research areas to display yet" />}
    </div></section><section className="section soft"><div className="container data-grid"><Link href="/projects" className="data-card"><h2>Projects</h2><p>{data.projects.length} research and innovation projects</p><span className="link-arrow">Explore projects</span></Link><Link href="/publications" className="data-card"><h2>Publications</h2><p>{data.publications.length} publications</p><span className="link-arrow">Browse publications</span></Link><Link href="/laboratories" className="data-card"><h2>Laboratories</h2><p>Explore IET facilities.</p><span className="link-arrow">View laboratories</span></Link></div></section></>;
}

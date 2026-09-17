import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader, SectionHeading, SourceNote } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Departments", description: "Browse the six departments in the IET-DSMNRU Faculty of Engineering & Technology." };

export default async function DepartmentsPage() {
  const data = await getSiteData();
  return <>
    <PageHeader eyebrow="Academic structure" title="Departments as living profiles." description="Every department connects its programmes, people, laboratories, research and contact information through the same content model." breadcrumbs={[{ label: "Departments" }]} />
    <section className="section"><div className="container"><div className="content-grid"><div><SectionHeading eyebrow="IET / FoET" title={`${data.departments.length} academic units in the source profile.`} description="The supplied profile names six departments. The CMS can add, archive or review units without a frontend rewrite." /><div className="dept-grid">{data.departments.map((department, index) => <Link className="dept-card" href={`/departments/${department.slug}`} key={department.id}><span className="dept-code">0{index + 1} / {department.shortName || "IET"}</span><h3>{department.name}</h3><p>{department.overview}</p><span className="link-arrow">Open profile</span></Link>)}</div></div><aside className="info-aside"><div className="aside-card"><h3>Department record</h3><div className="aside-item"><strong>Connected entities</strong>Programmes · faculty · labs · research · projects · achievements · events</div><div className="aside-item"><strong>Workflow</strong>Draft → review → publish → archive</div><div className="aside-item"><strong>Editorial rule</strong>No department-specific fact is shown unless it has a source or an approved CMS record.</div></div><SourceNote>Department names and profiles are from the supplied IET-DSMNRU profile PDF, pages 3 and 7–20.</SourceNote></aside></div></div></section>
    <section className="section soft"><div className="container"><div className="section-head"><div><div className="eyebrow">Add a department</div><h2>One CMS record. No new page template.</h2></div><Link className="button" href="/admin/content/departments">Open department CMS <ArrowUpRight size={16} /></Link></div><p className="lead">A department administrator can maintain the profile, link programmes, associate faculty and laboratories, and send changes through the review workflow.</p></div></section>
  </>;
}

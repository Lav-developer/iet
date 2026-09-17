import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { PageHeader, SectionHeading, SourceNote, VerificationBadge } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const data = await getSiteData(); const program = data.programs.find((item) => item.slug === slug); return { title: program?.title || "Programme", description: program?.summary || "IET programme profile" }; }

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await getSiteData(); const program = data.programs.find((item) => item.slug === slug); if (!program) notFound();
  const department = data.departments.find((item) => item.slug === program.departmentSlug);
  const faculty = data.faculty.filter((item) => item.departmentSlug === program.departmentSlug && item.type === "FACULTY").slice(0, 6);
  const labs = data.laboratories.filter((item) => item.departmentSlug === program.departmentSlug);
  return <>
    <PageHeader eyebrow={`Programme / ${program.level}`} title={program.title} description={program.summary} breadcrumbs={[{ label: "Programs", href: "/programs" }, { label: program.shortTitle || program.title }]} />
    <section className="section"><div className="container"><div className="detail-layout"><div>
      <section className="detail-section"><VerificationBadge status={program.status} /><h2 style={{ marginTop: 22 }}>A programme record, not an admissions portal.</h2><p className="lead" style={{ fontSize: ".98rem" }}>{program.admissionNote}</p><SourceNote>{program.sourceNote}</SourceNote></section>
      <section className="detail-section"><SectionHeading eyebrow="At a glance" title="Published programme facts" /><div className="data-grid"><div className="data-card"><span className="eyebrow">Level</span><h3>{program.level === "UG" ? "Undergraduate" : program.level === "PG" ? "Postgraduate" : program.level}</h3><p>As listed in the IET source seat matrix.</p></div><div className="data-card"><span className="eyebrow">Duration</span><h3>{program.duration}</h3><p>Programme duration recorded in the supplied profile.</p></div><div className="data-card"><span className="eyebrow">Approved seats</span><h3>{program.approvedSeats ?? "Awaiting official information"}</h3><p>Seat matrix entry; confirm the current bulletin before publication.</p></div></div></section>
      <section className="detail-section"><SectionHeading eyebrow="Department" title={department?.name || "Department record not connected"} />{department ? <div className="data-card"><p>{department.overview}</p><Link href={`/departments/${department.slug}`} className="link-arrow">Open department profile</Link></div> : <p className="small">This programme needs a department association in the CMS.</p>}</section>
      <section className="detail-section"><SectionHeading eyebrow="People & facilities" title="Connected discovery" /><div className="data-grid"><div className="data-card"><h3>Faculty</h3><p>{faculty.length ? faculty.map((person) => person.name).join(" · ") : "No faculty links published yet."}</p>{department && <Link href={`/departments/${department.slug}#people`} className="link-arrow">View department people</Link>}</div><div className="data-card"><h3>Laboratories</h3><p>{labs.length ? labs.map((lab) => lab.name).join(" · ") : "No laboratory links published yet."}</p>{department && <Link href={`/departments/${department.slug}#facilities`} className="link-arrow">View facilities</Link>}</div></div></section>
    </div><aside className="info-aside"><div className="aside-card"><h3>Application boundary</h3><div className="aside-item"><strong>Eligibility</strong>{program.eligibility}</div><div className="aside-item"><strong>Fees</strong>Not repeated here unless verified in an approved IET record.</div><div className="aside-item"><strong>Applications</strong><a className="link-arrow" href="https://dsmru.up.nic.in/main/User/admission_pro.aspx" target="_blank" rel="noreferrer">Official DSMNRU admissions <ExternalLink size={13} /></a></div></div><Link href="/admin/content/programs" className="button secondary" style={{ width: "100%" }}>Edit in CMS <ArrowUpRight size={15} /></Link></aside></div></div></section>
  </>;
}

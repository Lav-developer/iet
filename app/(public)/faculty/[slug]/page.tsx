import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { Avatar, EmptyState, PageHeader, SectionHeading, SourceNote, VerificationBadge } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const data = await getSiteData(); const person = data.faculty.find((item) => item.slug === slug); return { title: person?.name || "Faculty profile", description: person?.designation || "IET faculty profile" }; }

export default async function FacultyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await getSiteData(); const person = data.faculty.find((item) => item.slug === slug); if (!person) notFound();
  const department = data.departments.find((item) => item.slug === person.departmentSlug);
  const areas = data.researchAreas.filter((item) => item.facultySlugs?.includes(person.slug));
  const projects = data.projects.filter((item) => item.facultySlugs?.includes(person.slug));
  return <>
    <PageHeader eyebrow={`People / ${person.type === "FACULTY" ? "Faculty" : person.type || "Profile"}`} title={person.name} description={person.designation} breadcrumbs={[{ label: "Faculty", href: "/faculty" }, { label: person.name }]} />
    <section className="section"><div className="container"><div className="detail-layout"><div>
      <section className="detail-section"><div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}><Avatar name={person.name} /><div><VerificationBadge status={person.status} /><h2 style={{ marginTop: 10 }}>{person.name}</h2><p className="lead" style={{ fontSize: ".97rem" }}>{person.designation}</p></div></div>{person.profile && <p style={{ marginTop: 25 }}>{person.profile}</p>}</section>
      <section className="detail-section"><SectionHeading eyebrow="Academic profile" title="Published details" /><div className="data-grid"><div className="data-card"><span className="eyebrow">Qualification</span><h3>{person.qualification || "Awaiting official information"}</h3></div><div className="data-card"><span className="eyebrow">Department</span><h3>{department ? <Link href={`/departments/${department.slug}`}>{department.name}</Link> : "Leadership / faculty-wide"}</h3></div><div className="data-card"><span className="eyebrow">Role type</span><h3>{person.type || "Profile"}</h3></div></div></section>
      <section className="detail-section"><SectionHeading eyebrow="Research discovery" title="Interests and connected records" />{person.researchInterests?.length ? <div className="data-grid">{person.researchInterests.map((interest) => <div className="data-card" key={interest}><span className="tag">Published interest</span><h3>{interest}</h3></div>)}</div> : <EmptyState title="Research interests are not published for this profile" description="Administrators can add reviewed research-area relationships and publication records through the CMS." />}{areas.length > 0 && <div style={{ marginTop: 18 }}><h3>Connected research areas</h3><div className="cta-row" style={{ marginTop: 12 }}>{areas.map((area) => <Link href={`/research#${area.slug}`} className="tag" key={area.id}>{area.name}</Link>)}</div></div>}{projects.length === 0 && <div style={{ marginTop: 18 }}><EmptyState title="No published projects connected" /></div>}</section>
      <section className="detail-section"><SectionHeading eyebrow="Scholarship" title="Publications" />{data.publications.filter((item) => item.authorSlugs?.includes(person.id) || item.authorSlugs?.includes(person.slug)).length ? data.publications.filter((item) => item.authorSlugs?.includes(person.id) || item.authorSlugs?.includes(person.slug)).map((item) => <div className="data-card" key={item.id}><h3>{item.title}</h3><p>{item.venue} {item.year ? `· ${item.year}` : ""}</p></div>) : <EmptyState title="No approved publication records connected" />}</section>
    </div><aside className="info-aside"><div className="aside-card"><h3>Contact</h3>{person.email && <div className="aside-item"><strong>Email</strong><a className="contact-line" href={`mailto:${person.email}`}><Mail size={14} /> {person.email}</a></div>}{person.phone && <div className="aside-item"><strong>Phone</strong><span className="contact-line"><Phone size={14} /> {person.phone}</span></div>}{!person.email && !person.phone && <p className="small">No direct contact channel is published for this profile.</p>}</div><Link href="/admin/content/faculty" className="button secondary" style={{ width: "100%" }}>Edit in CMS <ArrowUpRight size={15} /></Link><SourceNote>Profile details are from the supplied IET-DSMNRU PDF. Confirm before official public launch.</SourceNote></aside></div></div></section>
  </>;
}

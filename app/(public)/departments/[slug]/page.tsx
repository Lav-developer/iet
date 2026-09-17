import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Mail, Phone, Users, FlaskConical } from "lucide-react";
import { Avatar, EmptyState, PageHeader, SectionHeading, SourceNote, VerificationBadge } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getSiteData();
  const department = data.departments.find((item) => item.slug === slug);
  return { title: department?.name || "Department", description: department?.overview || "IET department profile" };
}

export default async function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getSiteData();
  const department = data.departments.find((item) => item.slug === slug);
  if (!department) notFound();
  const programs = data.programs.filter((item) => item.departmentSlug === department.slug);
  const faculty = data.faculty.filter((item) => item.departmentSlug === department.slug && item.type !== "LABORATORY STAFF" && item.type !== "NON-TEACHING STAFF");
  const staff = data.faculty.filter((item) => item.departmentSlug === department.slug && item.type !== "FACULTY");
  const labs = data.laboratories.filter((item) => item.departmentSlug === department.slug);
  const areas = data.researchAreas.filter((item) => item.departmentSlugs?.includes(department.slug));
  const projects = data.projects.filter((item) => item.departmentSlug === department.slug);
  const achievements = data.achievements.filter((item) => item.departmentSlug === department.slug);
  return <>
    <PageHeader eyebrow={`Department / ${department.shortName || "IET"}`} title={department.name} description={department.overview} breadcrumbs={[{ label: "Departments", href: "/departments" }, { label: department.shortName || department.name }]} />
    <section className="section"><div className="container"><div className="department-banner"><div className="department-banner-copy"><VerificationBadge status={department.status} /><h2 style={{ marginTop: 20 }}>A profile that stays connected.</h2><p className="lead" style={{ fontSize: ".98rem" }}>This page is generated from a department record. Its associated programmes, faculty, laboratories, research areas and future activity records are queryable entities — not copied blocks.</p><SourceNote>{department.sourceNote}</SourceNote></div><div className="department-banner-aside"><span className="eyebrow inverse">Record status</span><strong>{department.established || "IET / FoET"}</strong><span style={{ color: "#b8c8cf", fontSize: ".78rem" }}>{department.established ? "established / source marker" : "institutional unit"}</span></div></div>
      <div className="detail-layout"><div>
        <section className="detail-section"><SectionHeading eyebrow="Academic offer" title="Programmes" description="Programme records connected to this department." />{programs.length ? <div className="data-grid">{programs.map((program) => <Link href={`/programs/${program.slug}`} className="data-card" key={program.id}><div className="card-meta"><span className="tag">{program.level}</span><span className="tag">{program.duration}</span></div><h3>{program.shortTitle || program.title}</h3><p>{program.summary}</p><span className="link-arrow">View programme</span></Link>)}</div> : <EmptyState title="No programme record is connected" />}</section>
        <section className="detail-section"><SectionHeading eyebrow="People" title="Faculty" href="/faculty" linkLabel="All faculty" />{faculty.length ? <div className="profile-grid">{faculty.map((person) => <FacultyMiniCard key={person.id} person={person} />)}</div> : <EmptyState title="No approved faculty profiles connected" />}{staff.length > 0 && <><h3 style={{ marginTop: 28 }}>Laboratory &amp; non-teaching staff</h3><div className="data-grid" style={{ marginTop: 15 }}>{staff.map((person) => <FacultyMiniCard key={person.id} person={person} compact />)}</div></>}</section>
        <section className="detail-section"><SectionHeading eyebrow="Facilities" title="Laboratories" href="/laboratories" linkLabel="All laboratories" />{labs.length ? <div className="data-grid">{labs.map((lab) => <Link className="data-card" href={`/laboratories/${lab.slug}`} key={lab.id}><FlaskConical size={23} color="var(--copper)" /><h3>{lab.name}</h3><p>{lab.description}</p><span className="link-arrow">Open facility record</span></Link>)}</div> : <EmptyState title="No approved laboratory record connected" />}</section>
        <section className="detail-section"><SectionHeading eyebrow="Research & innovation" title="Areas and activity" href="/research" linkLabel="Research hub" />{areas.length ? <div className="data-grid">{areas.map((area) => <Link href={`/research#${area.slug}`} className="data-card" key={area.id}><span className="tag">Research area</span><h3>{area.name}</h3><p>{area.description}</p></Link>)}</div> : <EmptyState title="No research area connected" description="An administrator can link this department to approved research areas, projects and publications." />}{projects.length === 0 && <div style={{ marginTop: 15 }}><EmptyState title="No published projects yet" /></div>}</section>
        <section className="detail-section"><SectionHeading eyebrow="Student experience" title="Achievements & activities" />{achievements.length ? <div className="data-grid">{achievements.map((achievement) => <div className="data-card" key={achievement.id}><span className="tag">{achievement.category}</span><h3>{achievement.title}</h3><p>{achievement.description}</p></div>)}</div> : <EmptyState title="No approved department achievements yet" description="Student and team achievements can be submitted as structured records through the CMS." />}</section>
      </div><aside className="info-aside"><div className="aside-card"><h3>Department connections</h3><div className="aside-item"><strong>People</strong><Users size={14} /> {faculty.length} published faculty profiles</div><div className="aside-item"><strong>Facilities</strong><FlaskConical size={14} /> {labs.length} facility records</div><div className="aside-item"><strong>Programmes</strong>{programs.length} connected programme records</div></div><div className="aside-card"><h3>Contact</h3><p className="small">Department contact channel is awaiting an approved record unless listed below.</p>{faculty.slice(0, 1).map((person) => <div key={person.id} className="aside-item"><strong>Coordinator / first listed profile</strong>{person.name}{person.email && <a className="contact-line" href={`mailto:${person.email}`}><Mail size={13} /> {person.email}</a>}{person.phone && <span className="contact-line"><Phone size={13} /> {person.phone}</span>}</div>)}<Link href="/contact" className="link-arrow">Institute contact</Link></div><Link href="/admin/content/departments" className="button secondary" style={{ width: "100%" }}>Edit in CMS <ArrowUpRight size={15} /></Link></aside></div></div></section>
  </>;
}

function FacultyMiniCard({ person, compact = false }: { person: import("@/lib/types").FacultyMember; compact?: boolean }) {
  return <Link href={`/faculty/${person.slug}`} className="profile-card" style={compact ? { minHeight: 175 } : undefined}><Avatar name={person.name} /><h3>{person.name}</h3><div className="designation">{person.designation}</div><div className="profile-spacer" />{person.email && <span className="contact-line">{person.email}</span>}<span className="link-arrow" style={{ marginTop: 10 }}>{compact ? "Open staff record" : "Open profile"}</span></Link>;
}

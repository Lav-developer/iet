import { DepartmentSocialLinks } from "@/components/department-social";
import { departmentContacts } from "@/lib/public-content";
import { ProjectCard } from "@/components/content-cards";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Users, FlaskConical } from "lucide-react";
import { Avatar, EmptyState, PageHeader, SectionHeading } from "@/components/ui";
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
  const contacts = departmentContacts(department, data.faculty);
  const staff = data.faculty.filter((item) => item.departmentSlug === department.slug && ["LABORATORY STAFF", "NON-TEACHING STAFF"].includes(item.type || ""));
  const labs = data.laboratories.filter((item) => item.departmentSlug === department.slug);
  const areas = data.researchAreas.filter((item) => item.departmentSlugs?.includes(department.slug));
  const projects = data.projects.filter((item) => item.departmentSlug === department.slug);
  const achievements = data.achievements.filter((item) => item.departmentSlug === department.slug);
  return <>
    <PageHeader eyebrow={`Department / ${department.shortName || "IET"}`} title={department.name} description={department.overview} breadcrumbs={[{ label: "Departments", href: "/departments" }, { label: department.shortName || department.name }]} />
    <section className="section"><div className="container"><div className="detail-layout"><div>
        <section className="detail-section"><SectionHeading eyebrow="Academic offer" title="Programmes" />{programs.length ? <div className="data-grid">{programs.map((program) => <Link href={`/programs/${program.slug}`} className="data-card" key={program.id}><div className="card-meta"><span className="tag">{program.level}</span><span className="tag">{program.duration}</span></div><h3>{program.shortTitle || program.title}</h3><p>{program.summary}</p><span className="link-arrow">View programme</span></Link>)}</div> : <EmptyState title="Programme information will be added here" />}</section>
        <section id="people" className="detail-section"><SectionHeading eyebrow="People" title="Faculty" href="/faculty" linkLabel="All faculty" />{faculty.length ? <div className="profile-grid">{faculty.map((person) => <FacultyMiniCard key={person.id} person={person} />)}</div> : <EmptyState title="Faculty information will be added here" />}{staff.length > 0 && <><h3 style={{ marginTop: 28 }}>Laboratory &amp; non-teaching staff</h3><div className="data-grid" style={{ marginTop: 15 }}>{staff.map((person) => <FacultyMiniCard key={person.id} person={person} compact />)}</div></>}</section>
        <section id="facilities" className="detail-section"><SectionHeading eyebrow="Facilities" title="Laboratories" href="/laboratories" linkLabel="All laboratories" />{labs.length ? <div className="data-grid">{labs.map((lab) => <Link className="data-card" href={`/laboratories/${lab.slug}`} key={lab.id}><FlaskConical size={23} color="var(--copper)" /><h3>{lab.name}</h3><p>{lab.description}</p><span className="link-arrow">Explore laboratory</span></Link>)}</div> : <EmptyState title="Laboratory information will be added here" />}</section>
        <section className="detail-section"><SectionHeading eyebrow="Research & innovation" title="Areas and activity" href="/research" linkLabel="Research hub" />{areas.length ? <div className="data-grid">{areas.map((area) => <Link href={`/research#${area.slug}`} className="data-card" key={area.id}><span className="tag">Research area</span><h3>{area.name}</h3><p>{area.description}</p></Link>)}</div> : <EmptyState title="Research information will be added here" />}{projects.length > 0 && <div className="data-grid" style={{ marginTop: 15 }}>{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>}</section>
        <section className="detail-section"><SectionHeading eyebrow="Student experience" title="Achievements & activities" />{achievements.length ? <div className="data-grid">{achievements.map((achievement) => <div className="data-card" key={achievement.id}><span className="tag">{achievement.category}</span><h3>{achievement.title}</h3><p>{achievement.description}</p></div>)}</div> : <EmptyState title="No department achievements to display yet" />}</section>
        {department.socialLinks && department.socialLinks.length > 0 && <section id="channels" className="detail-section"><SectionHeading eyebrow="Official accounts" title="Department channels" description="Official social and external channels owned by this department." /><DepartmentSocialLinks links={department.socialLinks} departmentName={department.name} /></section>}
      </div><aside className="info-aside"><div className="aside-card"><h3>At a glance</h3>{department.established && /^\d{4}$/.test(department.established) && <div className="aside-item"><strong>Established</strong>{department.established}</div>}<div className="aside-item"><strong>People</strong><Users size={14} /> {faculty.length} faculty</div><div className="aside-item"><strong>Facilities</strong><FlaskConical size={14} /> {labs.length} laboratories</div><div className="aside-item"><strong>Programmes</strong>{programs.length} programmes</div></div><div className="aside-card"><h3>Contact</h3>{contacts.length > 0 ? contacts.map((contact) => <div className="aside-item" key={contact.id}><strong>{contact.role}</strong><Link href={`/faculty/${contact.person.slug}`}>{contact.person.name}</Link>{contact.person.designation && <span className="small">{contact.person.designation}</span>}{contact.person.email && <a className="contact-line" href={`mailto:${contact.person.email}`}><Mail size={13} /> {contact.person.email}</a>}{contact.person.phone && <a className="contact-line" href={`tel:${contact.person.phone.replace(/[^+\d]/g, "")}`}><Phone size={13} /> {contact.person.phone}</a>}</div>) : <p className="small">Department contact information is not available yet.</p>}<Link href="/contact" className="link-arrow">Institute contact</Link></div></aside></div></div></section>
  </>;
}

function FacultyMiniCard({ person, compact = false }: { person: import("@/lib/types").FacultyMember; compact?: boolean }) {
  return <Link href={`/faculty/${person.slug}`} className="profile-card" style={compact ? { minHeight: 175 } : undefined}><Avatar name={person.name} image={person.profileImage} /><h3>{person.name}</h3><div className="designation">{person.designation}</div><div className="profile-spacer" />{person.email && <span className="contact-line">{person.email}</span>}<span className="link-arrow" style={{ marginTop: 10 }}>{compact ? "Open staff profile" : "Open profile"}</span></Link>;
}

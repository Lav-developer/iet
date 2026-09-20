import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, PageHeader } from "@/components/ui";
import { ProjectCard, PublicationCard } from "@/components/content-cards";
import { facultyProfileContent } from "@/lib/faculty-profile";
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

  const { designation, qualification, roleType, biography, interests, department, areas, laboratories, projects, publications, achievements, email, phone } = facultyProfileContent(person, data);
  const hasAcademicDetails = Boolean(qualification || department || roleType);
  const hasResearch = interests.length > 0 || areas.length > 0;
  const hasSidebar = Boolean(department || email || phone || person.cv);

  return <>
    <PageHeader eyebrow="Faculty & staff" title={person.name} description={designation || ""} breadcrumbs={[{ label: "Faculty & staff", href: "/faculty" }, { label: person.name }]} />
    <section className="section">
      <div className={`container detail-layout faculty-profile-layout${hasSidebar ? "" : " faculty-profile-layout--single"}`}>
        <div>
          <section className="detail-section faculty-identity" aria-label="Profile information">
            <Avatar name={person.name} image={person.profileImage} />
            <div><h2>{person.name}</h2>{designation && <p className="faculty-designation">{designation}</p>}</div>
          </section>

          {hasAcademicDetails && <section className="detail-section" id="academic-details" aria-labelledby="academic-details-heading">
            <h2 id="academic-details-heading">Academic details</h2>
            <dl className="faculty-academic-details">
              {qualification && <div><dt>Qualification</dt><dd>{qualification}</dd></div>}
              {department && <div><dt>Department</dt><dd><Link href={`/departments/${department.slug}`}>{department.name}</Link></dd></div>}
              {roleType && <div><dt>Role type</dt><dd>{roleType}</dd></div>}
            </dl>
          </section>}

          {biography && <section className="detail-section" id="about-profile" aria-labelledby="about-profile-heading">
            <h2 id="about-profile-heading">About</h2><p className="faculty-biography">{biography}</p>
          </section>}

          {hasResearch && <section className="detail-section" id="research-expertise" aria-labelledby="research-expertise-heading">
            <h2 id="research-expertise-heading">Research &amp; expertise</h2>
            {interests.length > 0 && <div className="faculty-research-group">
              <h3>Research interests</h3><ul className="faculty-interests">{interests.map((interest, index) => <li key={`${index}-${interest}`}>{interest}</li>)}</ul>
            </div>}
            {areas.length > 0 && <div className="faculty-research-group">
              <h3>Research areas</h3><ul className="faculty-related-areas">{areas.map((area) => <li key={area.id}>
                <Link className="link-arrow" href={`/research#${area.slug}`}>{area.name}</Link>
                {area.description && <p>{area.description}</p>}
              </li>)}</ul>
            </div>}
          </section>}

          {laboratories.length > 0 && <section className="detail-section" id="profile-laboratories" aria-labelledby="profile-laboratories-heading">
            <h2 id="profile-laboratories-heading">Laboratories</h2>
            <div className="faculty-related-grid">{laboratories.map((lab) => <Link className="data-card faculty-related-link" href={`/laboratories/${lab.slug}`} key={lab.id}>
              <h3>{lab.name}</h3>{lab.description && <p>{lab.description}</p>}<span className="link-arrow">Explore laboratory</span>
            </Link>)}</div>
          </section>}

          {projects.length > 0 && <section className="detail-section" id="profile-projects" aria-labelledby="profile-projects-heading">
            <h2 id="profile-projects-heading">Projects</h2><div className="faculty-related-grid">{projects.map((project) => <ProjectCard project={project} key={project.id} />)}</div>
          </section>}

          {publications.length > 0 && <section className="detail-section" id="profile-publications" aria-labelledby="profile-publications-heading">
            <h2 id="profile-publications-heading">Publications</h2><div className="faculty-related-grid">{publications.map((publication) => <PublicationCard publication={publication} key={publication.id} />)}</div>
          </section>}

          {achievements.length > 0 && <section className="detail-section" id="profile-achievements" aria-labelledby="profile-achievements-heading">
            <h2 id="profile-achievements-heading">Achievements</h2><div className="faculty-related-grid">{achievements.map((achievement) => <article className="data-card" key={achievement.id}>
              <span className="tag">{achievement.category}</span><h3>{achievement.title}</h3><p>{achievement.description}</p>
              <p className="small">{achievement.recipient}</p>
              {(achievement.year || achievement.eventName) && <p className="small">{[achievement.year, achievement.eventName].filter(Boolean).join(" · ")}</p>}
            </article>)}</div>
          </section>}

          <Link className="link-arrow faculty-back-link" href="/faculty">Back to Faculty &amp; staff</Link>
        </div>

        {hasSidebar && <aside className="info-aside" aria-label="Department and contact information">
          {department && <div className="aside-card"><h2>Department</h2><Link className="link-arrow" href={`/departments/${department.slug}`}>{department.name}</Link></div>}
          {(email || phone) && <div className="aside-card">
            <h2>Contact</h2>
            {email && <div className="aside-item"><strong>Email</strong><a className="contact-line" href={`mailto:${email}`}>{email}</a></div>}
            {phone && <div className="aside-item"><strong>Phone</strong><a className="contact-line" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a></div>}
          </div>}
          {person.cv && <div className="aside-card"><h2>Curriculum vitae</h2>
            <a className="button" href={person.cv.url} target={person.cv.external ? "_blank" : undefined} rel={person.cv.external ? "noopener noreferrer" : undefined}>
              {person.cv.external ? "View CV" : "Download CV (PDF)"}{person.cv.external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </div>}
        </aside>}
      </div>
    </section>
  </>;
}

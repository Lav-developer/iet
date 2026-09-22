import Link from "next/link";
import { ArrowUpRight, FlaskConical, GraduationCap, Users, Accessibility, Compass } from "lucide-react";
import { CountLabel, SectionHeading } from "@/components/ui";
import { HomeNoticeBoard } from "@/components/notice-board";
import { getSiteData } from "@/lib/store";

export const metadata = {
  title: "Engineering for an accessible future",
  description: "Explore inclusive, accessible and industry-oriented engineering education at IET-DSMNRU.",
};

export default async function HomePage() {
  const data = await getSiteData();
  const cse = data.departments.find((item) => item.slug === "computer-science-engineering");
  const featuredAreas = data.researchAreas.slice(0, 4);
  return (
    <>
      <section className="home-hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="hero-kicker">Institute / Faculty of Engineering &amp; Technology</div>
              <h1 className="display">Engineering built for <em>inclusion.</em></h1>
              <p className="lead">Explore engineering education at Dr. Shakuntala Misra National Rehabilitation University, Lucknow — our programmes, people, laboratories and research.</p>
              <div className="cta-row" style={{ marginTop: 28 }}>
                <Link href="/programs" className="button">Explore programmes <ArrowUpRight size={16} /></Link>
                <Link href="/departments" className="button secondary">Browse departments</Link>
              </div>
              <div className="hero-foot"><p className="hero-foot-note">Established in 2016, IET is part of the Faculty of Engineering &amp; Technology, with inclusive, accessible and industry-oriented technical education at its centre.</p><Link className="link-arrow" href="/about">Read the institute profile</Link></div>
            </div>
            <div className="hero-diagram" aria-label="A schematic showing how academic programmes, people, research and access connect">
              <div className="diagram-index">EXPLORE IET</div>
              <div className="diagram-node n1">Programmes</div><div className="diagram-node n2">Research</div><div className="diagram-node n3">Access by design</div><div className="diagram-node n4">IET</div>
              <div className="diagram-line l1" /><div className="diagram-line l2" /><div className="diagram-line l3" />
              <div className="diagram-caption">Education · Research · Inclusion</div>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="signal-rail">
          <CountLabel count={2016} label="Year established" />
          <CountLabel count={data.departments.length} label="Academic departments" />
          <CountLabel count={data.programs.length} label="Programmes" />
          <CountLabel count={data.laboratories.length} label="Laboratories" />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Explore IET" title="Find the right entry point." description="Find information for study, research and collaboration." />
          <div className="route-grid">
            <RouteCard number="01" icon={<GraduationCap size={23} />} title="Prospective students" body="Compare programmes, departments, laboratories and the official DSMNRU admissions route." href="/programs" />
            <RouteCard number="02" icon={<Users size={23} />} title="Faculty & researchers" body="Explore research areas, faculty expertise, projects and publications." href="/research" />
            <RouteCard number="03" icon={<FlaskConical size={23} />} title="Industry & collaborators" body="Contact IET to discuss academic and industry collaboration." href="/contact" />
            <RouteCard number="04" icon={<Accessibility size={23} />} title="Access & inclusion" body="Find accessibility options and guidance for using this website." href="/accessibility" />
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <SectionHeading eyebrow="Academic structure" title="Our departments" description="Explore the academic disciplines at IET." href="/departments" linkLabel="View all departments" />
          <div className="dept-grid">{data.departments.map((department, index) => <Link href={`/departments/${department.slug}`} className="dept-card" key={department.id}><span className="dept-code">0{index + 1} / {department.shortName || "IET"}</span><h3>{department.name}</h3><p>{department.overview}</p><span className="link-arrow">Open department</span></Link>)}</div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <SectionHeading eyebrow="Research discovery" title="From a research area to the people behind it." description="Discover faculty expertise, laboratories, projects and publications." href="/research" linkLabel="Explore research" />
          <div className="research-map">
            <div><span className="map-label">01 / Area</span><h3>{featuredAreas[0]?.name || "Research area"}</h3><p>{featuredAreas[0]?.description}</p></div>
            <div><span className="map-label">02 / People</span><h3>Faculty expertise</h3><ul>{data.faculty.filter((item) => item.researchInterests?.length).slice(0, 3).map((item) => <li key={item.id}><Link href={`/faculty/${item.slug}`}>{item.name}</Link></li>)}{!data.faculty.some((item) => item.researchInterests?.length) && <li>Explore the faculty directory for academic profiles.</li>}</ul></div>
            <div><span className="map-label">03 / Research</span><h3>Projects · labs · publications</h3><p>Explore the work of IET researchers and the facilities that support them.</p><Link className="link-arrow" href="/research" style={{ color: "var(--lime)" }}>Explore research</Link></div>
          </div>
        </div>
      </section>

      <HomeNoticeBoard notices={data.notices} />

      <section className="section tight soft">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
          <div><div className="eyebrow">Need an official university service?</div><h2 style={{ marginTop: 10 }}>University services</h2><p className="lead" style={{ fontSize: ".95rem" }}>Find admissions, examinations, results, university notices and student services.</p></div><div className="cta-row"><Link href="/resources" className="button copper">View official links <Compass size={17} /></Link><Link href="/admissions/fee-structure" className="button secondary">Fee structure</Link></div>
        </div>
      </section>
    </>
  );
}

function RouteCard({ number, icon, title, body, href }: { number: string; icon: React.ReactNode; title: string; body: string; href: string }) {
  return <Link href={href} className="route-card"><span className="route-no">{number} <span style={{ color: "var(--ink)", marginLeft: 9 }}>{icon}</span></span><div><h3>{title}</h3><p>{body}</p></div><span className="link-arrow">Continue</span></Link>;
}

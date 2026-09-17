import Link from "next/link";
import { ArrowUpRight, BookOpen, FlaskConical, GraduationCap, Users, Accessibility, Compass } from "lucide-react";
import { CountLabel, SectionHeading, SourceNote, VerificationBadge } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = {
  title: "Engineering for an accessible future",
  description: "IET-DSMNRU is the engineering information platform for inclusive, accessible and industry-oriented technical education.",
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
              <p className="lead">The digital front door of engineering education at Dr. Shakuntala Misra National Rehabilitation University, Lucknow — structured around programmes, people, laboratories, research and the university systems that support them.</p>
              <div className="cta-row" style={{ marginTop: 28 }}>
                <Link href="/programs" className="button">Explore programmes <ArrowUpRight size={16} /></Link>
                <Link href="/departments" className="button secondary">Browse departments</Link>
              </div>
              <div className="hero-foot"><p className="hero-foot-note">IET was established in 2016. The supplied profile describes its progression into a broader Faculty of Engineering &amp; Technology, with inclusive, accessible and industry-oriented technical education at its centre.</p><Link className="link-arrow" href="/about">Read the institute profile</Link></div>
            </div>
            <div className="hero-diagram" aria-label="A schematic showing how academic programmes, people, research and access connect">
              <div className="diagram-index">SYSTEM MAP / 00</div>
              <div className="diagram-node n1">Programmes</div><div className="diagram-node n2">Research</div><div className="diagram-node n3">Access by design</div><div className="diagram-node n4">IET</div>
              <div className="diagram-line l1" /><div className="diagram-line l2" /><div className="diagram-line l3" />
              <div className="diagram-caption">A content system, not a notice board</div>
            </div>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="signal-rail">
          <CountLabel count={2016} label="IET established, as stated in the supplied profile" />
          <CountLabel count={data.departments.length} label="academic departments in the IET profile" />
          <CountLabel count={data.programs.length} label="programme records in the published seat matrix" />
          <CountLabel count={data.laboratories.length} label="laboratory records / facility headings" />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Start with a route" title="Find the right entry point." description="Different audiences need different paths through the same institutional knowledge base. The navigation is organized around what visitors are trying to discover." />
          <div className="route-grid">
            <RouteCard number="01" icon={<GraduationCap size={23} />} title="Prospective students" body="Compare programmes, departments, laboratories and the official DSMNRU admissions route." href="/programs" />
            <RouteCard number="02" icon={<Users size={23} />} title="Faculty & researchers" body="Trace research areas into people, projects, laboratories and publications as records become approved." href="/research" />
            <RouteCard number="03" icon={<FlaskConical size={23} />} title="Industry & collaborators" body="Understand IET capabilities without confusing institute content with university-wide services." href="/contact" />
            <RouteCard number="04" icon={<Accessibility size={23} />} title="Access & inclusion" body="Read the institute identity through an accessible, keyboard-ready information experience." href="/accessibility" />
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <SectionHeading eyebrow="Academic structure" title="Six departments. One connected faculty." description="Each department is a structured profile rather than a hardcoded page. New departments can be added and published through the CMS." href="/departments" linkLabel="View all departments" />
          <div className="dept-grid">{data.departments.map((department, index) => <Link href={`/departments/${department.slug}`} className="dept-card" key={department.id}><span className="dept-code">0{index + 1} / {department.shortName || "IET"}</span><h3>{department.name}</h3><p>{department.overview}</p><span className="link-arrow">Open department</span></Link>)}</div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <SectionHeading eyebrow="Research discovery" title="From a research area to the people behind it." description="The platform is designed for connected discovery. As approved projects and publications are entered, an area can lead visitors through faculty expertise, laboratories and evidence." href="/research" linkLabel="Explore research" />
          <div className="research-map">
            <div><span className="map-label">01 / Area</span><h3>{featuredAreas[0]?.name || "Research area"}</h3><p>{featuredAreas[0]?.description}</p></div>
            <div><span className="map-label">02 / People</span><h3>Faculty expertise</h3><ul>{data.faculty.filter((item) => item.researchInterests?.length).slice(0, 3).map((item) => <li key={item.id}>{item.name}</li>)}{!data.faculty.some((item) => item.researchInterests?.length) && <li>Awaiting approved faculty research links</li>}</ul></div>
            <div><span className="map-label">03 / Next records</span><h3>Projects · labs · publications</h3><p>These entities are first-class CMS records. The seed includes draft placeholders where the source document does not provide an approved record.</p><Link className="link-arrow" href="/research" style={{ color: "var(--lime)" }}>See the research model</Link></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Verified content surface" title="The source is the interface." description="No fabricated rankings, placement percentages, collaborations or event calendars. Where the supplied profile is silent, the interface asks the CMS for an approved record." />
          <div className="ecosystem-grid">
            <div className="ecosystem-panel"><VerificationBadge /><h3 style={{ fontSize: "1.7rem", marginTop: 22 }}>IET owns its academic identity.</h3><p className="lead" style={{ fontSize: ".95rem" }}>Departments, programmes, faculty, laboratories, research, projects, achievements and IET events belong here. DSMNRU continues to own university notices, examinations, results, Samarth and admissions infrastructure.</p><Link href="/resources" className="link-arrow">Open the university links map</Link></div>
            <div className="governance-note"><div className="eyebrow inverse">Content governance</div><h3 style={{ color: "white", fontSize: "1.7rem", marginTop: 16 }}>Draft → review → publish</h3><p>Administrators can maintain structured content, media, documents, links and audit records without editing frontend code.</p><Link className="link-arrow" href="/admin">Open the CMS</Link></div>
          </div>
        </div>
      </section>

      <section className="section tight soft">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
          <div><div className="eyebrow">Need an official university service?</div><h2 style={{ marginTop: 10 }}>Go to the system that owns it.</h2><p className="lead" style={{ fontSize: ".95rem" }}>IET should be the front door for institute knowledge — not a duplicate ERP or notice portal.</p></div><Link href="/resources" className="button copper">View official links <Compass size={17} /></Link>
        </div>
      </section>
    </>
  );
}

function RouteCard({ number, icon, title, body, href }: { number: string; icon: React.ReactNode; title: string; body: string; href: string }) {
  return <Link href={href} className="route-card"><span className="route-no">{number} <span style={{ color: "var(--ink)", marginLeft: 9 }}>{icon}</span></span><div><h3>{title}</h3><p>{body}</p></div><span className="link-arrow">Continue</span></Link>;
}

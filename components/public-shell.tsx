"use client";

import Link from "next/link";
import { Menu, Search, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccessibilityWidget } from "@/components/accessibility";

const navItems = [
  { href: "/about", label: "About" },
  { href: "/departments", label: "Departments" },
  { href: "/programs", label: "Programs" },
  { href: "/people", label: "People" },
  { href: "/research", label: "Research" },
  { href: "/campus", label: "Campus" },
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  const organizationSchema = { "@context": "https://schema.org", "@type": "EducationalOrganization", name: "Institute of Engineering & Technology (IET), DSMNRU", parentOrganization: { "@type": "CollegeOrUniversity", name: "Dr. Shakuntala Misra National Rehabilitation University" }, address: { "@type": "PostalAddress", addressLocality: "Lucknow", addressRegion: "Uttar Pradesh", addressCountry: "IN" }, url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" };
  return <div className="shell"><SiteHeader /><main id="main-content" className="page-main">{children}</main><SiteFooter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} /></div>;
}

function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="utility-bar">
        <div className="utility-inner"><span>DSMNRU · Lucknow · Uttar Pradesh</span><span>Institutional information platform · review-ready build</span></div>
      </div>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="wordmark" aria-label="IET DSMNRU home">
            <span className="wordmark-mark" aria-hidden="true">IET</span>
            <span className="wordmark-title"><strong>Institute of Engineering &amp; Technology</strong><span>Dr. Shakuntala Misra National Rehabilitation University</span></span>
          </Link>
          <nav className="main-nav" aria-label="Primary navigation">
            {navItems.map((item) => <Link key={item.href} href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>{item.label}</Link>)}
            <Link href="/admissions" aria-current={isCurrent("/admissions") ? "page" : undefined}>Admissions</Link>
          </nav>
          <div className="header-actions">
            <Link href="/search" className="icon-button" aria-label="Search the IET site" title="Search"><Search size={18} /></Link>
            <AccessibilityWidget />
            <button className="menu-button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Menu size={19} /></button>
          </div>
        </div>
        <nav className={`mobile-nav ${open ? "open" : ""}`} aria-label="Mobile navigation">
          {[...navItems, { href: "/admissions", label: "Admissions" }, { href: "/contact", label: "Contact" }].map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={isCurrent(item.href) ? "page" : undefined}>{item.label}</Link>)}
        </nav>
      </header>
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="eyebrow inverse">IET / DSMNRU</div>
          <h2 style={{ color: "white", fontSize: "1.8rem", marginTop: 12 }}>Engineering for an accessible future.</h2>
          <p>This website architecture belongs to IET. University-wide notices, examinations, results, admissions infrastructure and student ERP remain on DSMNRU systems.</p>
        </div>
        <div><h3>Explore</h3><ul><li><Link href="/about">About IET</Link></li><li><Link href="/departments">Departments</Link></li><li><Link href="/programs">Programs</Link></li><li><Link href="/faculty">Faculty directory</Link></li><li><Link href="/laboratories">Laboratories</Link></li></ul></div>
        <div><h3>Discover</h3><ul><li><Link href="/research">Research</Link></li><li><Link href="/projects">Projects</Link></li><li><Link href="/publications">Publications</Link></li><li><Link href="/events">Events</Link></li><li><Link href="/achievements">Achievements</Link></li><li><Link href="/career">Career &amp; industry</Link></li><li><Link href="/contact">Contact</Link></li></ul></div>
        <div><h3>Official ecosystem</h3><ul><li><a href="https://dsmru.up.nic.in/" target="_blank" rel="noreferrer">DSMNRU website <ExternalLink size={12} /></a></li><li><a href="https://dsmru.samarth.edu.in/index.php/site/login" target="_blank" rel="noreferrer">Samarth student portal <ExternalLink size={12} /></a></li><li><Link href="/accessibility">Accessibility statement</Link></li><li><Link href="/privacy">Privacy placeholder</Link></li><li><Link href="/admin">CMS sign in</Link></li></ul></div>
      </div>
      <div className="container footer-bottom"><span>© IET-DSMNRU · Content is subject to institutional verification and approval.</span><span>Built for institutional ownership · English locale ready</span></div>
    </footer>
  );
}

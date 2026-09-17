import Link from "next/link";

export default function NotFound() { return <main className="login-page" style={{ background: "var(--paper)" }}><div className="login-card"><div className="eyebrow">404 / record not found</div><h1>This page is not published.</h1><p className="lead" style={{ fontSize: ".95rem" }}>The record may be a draft, archived or awaiting an approved CMS relationship.</p><div className="cta-row"><Link href="/" className="button">Back to IET</Link><Link href="/search" className="button secondary">Search the site</Link></div></div></main>; }

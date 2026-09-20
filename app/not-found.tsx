import Link from "next/link";

export default function NotFound() { return <main className="login-page" style={{ background: "var(--paper)" }}><div className="login-card"><div className="eyebrow">404 / page not found</div><h1>Page not found.</h1><p className="lead" style={{ fontSize: ".95rem" }}>The page may have moved or the address may be incorrect. Use the links below to find what you need.</p><div className="cta-row"><Link href="/" className="button">Back to IET</Link><Link href="/search" className="button secondary">Search the site</Link></div></div></main>; }

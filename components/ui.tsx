import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import type { ContentStatus } from "@/lib/types";

export function PageHeader({ eyebrow, title, description, breadcrumbs = [] }: { eyebrow: string; title: string; description: string; breadcrumbs?: { label: string; href?: string }[] }) {
  return (
    <section className="page-hero">
      <div className="container">
        <div className="breadcrumbs"><Link href="/">IET</Link>{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>/ {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}</span>)}</div>
        <div className="eyebrow inverse">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, href, linkLabel = "View all" }: { eyebrow: string; title: string; description?: string; href?: string; linkLabel?: string }) {
  return <div className="section-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{description && <p className="lead">{description}</p>}</div>{href && <Link className="link-arrow" href={href}>{linkLabel}</Link>}</div>;
}

export function StatusPill({ status }: { status: ContentStatus | string }) {
  return <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>;
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return <div className="source-note"><strong>Content provenance</strong><br />{children}</div>;
}

export function EmptyState({ title = "No approved records yet", description = "An IET administrator can add and publish this information through the CMS." }: { title?: string; description?: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{description}</span></div>;
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div className="profile-avatar" aria-hidden="true">{initials}</div>;
}

export function ArrowLink({ href, children, external = false }: { href: string; children: React.ReactNode; external?: boolean }) {
  if (external) return <a href={href} className="link-arrow" target="_blank" rel="noreferrer">{children}<ArrowUpRight size={15} aria-hidden="true" /></a>;
  return <Link href={href} className="link-arrow">{children}</Link>;
}

export function VerificationBadge({ status = "PUBLISHED" }: { status?: ContentStatus | string }) {
  if (status === "PUBLISHED") return <span className="tag"><CheckCircle2 size={13} color="#5f9b46" /> Verified source record</span>;
  if (status === "REVIEW") return <span className="tag"><Clock3 size={13} color="#2e72a7" /> Review required</span>;
  return <span className="tag"><CircleDashed size={13} color="#c56c3c" /> Awaiting official information</span>;
}

export function CountLabel({ count, label }: { count: number; label: string }) {
  return <div className="signal"><strong>{String(count).padStart(2, "0")}</strong><span>{label}</span></div>;
}

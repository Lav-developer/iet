"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleDashed, Database, FileEdit, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type DashboardStat = { label: string; total: number; published: number; drafts: number };
type DashboardHealth = { label: string; detail: string; ok: boolean };
type DashboardSummary = { mode: "database" | "demo"; stats: DashboardStat[]; health: DashboardHealth[] };
type DashboardError = { message: string; auth: boolean };

const LOAD_FAILED = "Unable to load dashboard.";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);

  useEffect(() => {
    fetch("/api/admin/summary")
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Partial<DashboardSummary> & { error?: string } | null;
        if (!response.ok) {
          // 401 is the only response that means the session is the problem;
          // any other failure is a server error and is reported as such
          // instead of being disguised as an expired sign-in.
          setError({ message: body?.error || LOAD_FAILED, auth: response.status === 401 });
          return;
        }
        setSummary(body as DashboardSummary);
      })
      .catch((err: unknown) => setError({ message: err instanceof Error ? err.message : LOAD_FAILED, auth: false }));
  }, []);

  if (error) return <div className="admin-panel"><div className="alert" role="alert">{error.message}{error.auth && <> <Link href="/admin/login">Sign in to continue.</Link></>}</div></div>;
  if (!summary) return <div className="admin-panel"><p className="small">Loading content health…</p></div>;
  return <><div className="admin-welcome"><div><div className="eyebrow">Administrator workspace</div><h2>Content health at a glance.</h2><p className="lead" style={{ fontSize: ".92rem" }}>Maintain the institute knowledge base without changing source code. Public pages only render published records.</p></div><Link href="/" className="button secondary">View public site <ArrowUpRight size={15} /></Link></div><div className="admin-grid-4">{summary.stats.map((item) => <div className="admin-stat" key={item.label}><span>{item.label}</span><strong>{item.total}</strong><small>{item.published} published · {item.drafts} draft/review</small></div>)}</div><div className="admin-panel"><div className="admin-panel-head"><h3>Content health</h3><span className="tag">{summary.mode === "database" ? "PostgreSQL" : "Demo fallback"}</span></div><div className="admin-health">{summary.health.map((item) => <div className="health-item" key={item.label}><span><strong>{item.label}</strong><span>{item.detail}</span></span>{item.ok ? <CheckCircle2 size={19} color="#5f9b46" /> : <CircleDashed size={19} color="#c56c3c" />}</div>)}</div></div><div className="admin-panel"><div className="admin-panel-head"><h3>Quick actions</h3><span className="small">Workflow: Draft → Review → Publish</span></div><div className="cta-row"><Link href="/admin/content/departments" className="button small-button">Add department</Link><Link href="/admin/content/faculty" className="button small-button">Update faculty</Link><Link href="/admin/content/events" className="button small-button">Create event</Link><Link href="/admin/content/media" className="button small-button secondary">Manage media</Link></div></div><div className="admin-panel"><div className="admin-panel-head"><h3>Platform handover</h3><Database size={18} color="var(--copper)" /></div><p className="small">This build is environment-driven: PostgreSQL schema and migrations, object-storage abstraction, role-aware sessions and audit logging are documented for transfer to IET / DSMNRU infrastructure.</p><div className="cta-row"><Link href="/admin/audit" className="link-arrow">Review audit log</Link><Link href="/admin/content/settings" className="link-arrow">Review site settings</Link><ShieldCheck size={16} color="var(--copper)" /></div></div></>;
}

"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleDashed, Database, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { canManageUsers, canViewAuditLogs, visibleAdminSections, visibleEntities } from "@/lib/content-policy";
import type { EntityName } from "@/lib/types";

type DashboardStat = { label: string; total: number; published: number; drafts: number };
type DashboardHealth = { label: string; detail: string; ok: boolean };
type DashboardSummary = { mode: "database" | "demo"; stats: DashboardStat[]; health: DashboardHealth[] };
type DashboardError = { message: string; auth: boolean };

const LOAD_FAILED = "Unable to load dashboard.";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setUser(body?.user || null))
      .catch(() => setUser(null));
  }, []);

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
  return <><div className="admin-welcome"><div><div className="eyebrow">Content management</div><h2>Content health at a glance.</h2><p className="lead" style={{ fontSize: ".92rem" }}>Keep the institute website up to date. Only published records appear on the public website; drafts and records in review stay private.</p></div><Link href="/" className="button secondary">View public website <ArrowUpRight size={15} /></Link></div><div className="admin-grid-4">{summary.stats.map((item) => <div className="admin-stat" key={item.label}><span>{item.label}</span><strong>{item.total}</strong><small>{item.published} published · {item.drafts} draft/review</small></div>)}</div><div className="admin-panel"><div className="admin-panel-head"><h3>Content health</h3><span className="tag">{summary.mode === "database" ? "Live database" : "Preview content"}</span></div><div className="admin-health">{summary.health.map((item) => <div className="health-item" key={item.label}><span><strong>{item.label}</strong><span>{item.detail}</span></span>{item.ok ? <CheckCircle2 size={19} color="#5f9b46" /> : <CircleDashed size={19} color="#c56c3c" />}</div>)}</div></div><div className="admin-panel"><div className="admin-panel-head"><h3>Quick actions</h3><span className="small">Save as draft, then publish when ready — review is optional.</span></div><div className="cta-row">{(() => {
      if (!user) return <span className="small">Checking your access…</span>;
      const allowed = new Set(visibleEntities(user).map((capability) => capability.entity));
      const actions: { entity: EntityName; label: string; href: string; secondary?: boolean }[] = [
        { entity: "notices", label: "Add a notice", href: "/admin/content/notices" },
        { entity: "departments", label: "Update departments", href: "/admin/content/departments" },
        { entity: "faculty", label: "Update faculty", href: "/admin/content/faculty" },
        { entity: "events", label: "Add an event", href: "/admin/content/events" },
        { entity: "documents", label: "Upload a PDF", href: "/admin/content/documents", secondary: true },
      ];
      const permitted = actions.filter((action) => allowed.has(action.entity));
      if (!permitted.length) return <span className="small">Your account has no content sections assigned yet. Ask an institute administrator.</span>;
      return permitted.map((action) => <Link key={action.href} href={action.href} className={`button small-button${action.secondary ? " secondary" : ""}`}>{action.label}</Link>);
    })()}</div></div><div className="admin-panel"><div className="admin-panel-head"><h3>Administration</h3><Database size={18} color="var(--copper)" /></div><p className="small">Every change is recorded in the audit log with the account that made it. Accounts, roles and department assignments are managed by institute administrators.</p><div className="cta-row">{user && canViewAuditLogs(user) && <Link href="/admin/audit" className="link-arrow">Open the audit log</Link>}{user && visibleEntities(user).some((capability) => capability.entity === "settings") && <Link href="/admin/content/settings" className="link-arrow">Site settings</Link>}{user && canManageUsers(user) && <Link href="/admin/users" className="link-arrow">Manage user accounts</Link>}{user && visibleAdminSections(user).includes("departmentContacts") && <Link href="/admin/department-contacts" className="link-arrow">Department contacts</Link>}<Link href="/admin/account" className="link-arrow">Change your password</Link><ShieldCheck size={16} color="var(--copper)" /></div></div></>;
}

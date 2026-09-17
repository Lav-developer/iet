"use client";

import Link from "next/link";
import { Activity, Archive, BookOpen, Building2, FileText, FlaskConical, Gauge, GraduationCap, Link2, LogOut, Search, Settings, ShieldCheck, Trophy, Users, CalendarDays, Microscope } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";

const contentLinks = [
  ["departments", "Departments", Building2], ["programs", "Programs", GraduationCap], ["faculty", "Faculty & staff", Users], ["laboratories", "Laboratories", FlaskConical], ["researchAreas", "Research areas", Microscope], ["projects", "Projects", Activity], ["publications", "Publications", BookOpen], ["achievements", "Achievements", Trophy], ["events", "Events", CalendarDays], ["organizations", "Organizations", Users], ["pages", "Pages", FileText], ["links", "Links", Link2], ["contacts", "Contacts", ShieldCheck], ["media", "Media library", FileText], ["documents", "Documents", FileText], ["settings", "Site settings", Settings],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  return <AdminFrame>{children}</AdminFrame>;
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((body) => setUser(body?.user || null)).catch(() => null); }, []);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/admin/login"); router.refresh(); };
  return <div className="admin-shell"><aside className="admin-sidebar"><Link href="/admin" className="admin-brand"><span className="wordmark-mark">IET</span><span><strong>Content Studio</strong><span>IET · DSMNRU</span></span></Link><nav className="admin-nav" aria-label="Admin navigation"><div className="admin-nav-label">Workspace</div><AdminLink href="/admin" label="Dashboard" icon={<Gauge size={15} />} active={pathname === "/admin"} /><AdminLink href="/admin/audit" label="Audit logs" icon={<Archive size={15} />} active={pathname.startsWith("/admin/audit")} /><AdminLink href="/admin/users" label="Users" icon={<ShieldCheck size={15} />} active={pathname.startsWith("/admin/users")} /><div className="admin-nav-label">Content</div>{contentLinks.map(([slug, label, Icon]) => <AdminLink key={slug} href={`/admin/content/${slug}`} label={label} icon={<Icon size={15} />} active={pathname.startsWith(`/admin/content/${slug}`)} />)}<div className="admin-nav-label">Public surface</div><AdminLink href="/" label="View public site" icon={<Search size={15} />} active={false} external /></nav><div className="admin-sidebar-bottom">{user ? <><strong style={{ color: "white", display: "block" }}>{user.name}</strong><span>{user.role.replaceAll("_", " ")}</span><button className="mini-button" style={{ marginTop: 12, color: "white", background: "transparent", borderColor: "#496274" }} onClick={logout}><LogOut size={13} /> Sign out</button></> : <span>Checking session…</span>}</div></aside><main className="admin-main"><header className="admin-topbar"><div><div className="admin-breadcrumb">IET / DSMNRU · Administrator workspace</div><h1>{pathname === "/admin" ? "Dashboard" : pathname.includes("/content/") ? "Content management" : pathname.startsWith("/admin/users") ? "User administration" : "Governance"}</h1></div><div className="admin-topbar-actions"><Link href="/" className="mini-button">Public site</Link><div className="admin-avatar" aria-label={user?.name || "Administrator"}>{(user?.name || "A").slice(0, 1).toUpperCase()}</div></div></header><div className="admin-content">{children}</div></main></div>;
}

function AdminLink({ href, label, icon, active, external = false }: { href: string; label: string; icon: React.ReactNode; active: boolean; external?: boolean }) { return <Link href={href} className={active ? "active" : ""} target={external ? "_blank" : undefined}>{icon}<span>{label}</span></Link>; }

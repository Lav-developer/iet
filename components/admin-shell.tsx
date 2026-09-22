"use client";

import Link from "next/link";
import { Activity, Archive, BookOpen, Building2, CalendarDays, ContactRound, ExternalLink, FileText, FlaskConical, Gauge, GraduationCap, Image as ImageIcon, KeyRound, Link2, LogOut, Menu, Microscope, Newspaper, Settings, ShieldCheck, Trophy, Users, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { EntityName } from "@/lib/types";
import { canManageUsers, canViewAuditLogs, visibleAdminSections, visibleEntities } from "@/lib/content-policy";

/**
 * Content sections, in workspace order. Which of them a role actually sees is
 * decided by the shared RBAC policy (`visibleEntities`) — never by a second
 * role list in this component.
 */
const contentLinks: [EntityName, string, typeof Newspaper][] = [
  ["departments", "Departments", Building2], ["programs", "Programmes", GraduationCap], ["faculty", "Faculty & staff", Users], ["laboratories", "Laboratories", FlaskConical], ["researchAreas", "Research", Microscope], ["projects", "Projects", Activity], ["publications", "Publications", BookOpen], ["achievements", "Achievements", Trophy], ["events", "Events", CalendarDays],
  ["notices", "Notices", Newspaper],
  ["organizations", "Student organizations", Users], ["pages", "Pages", FileText], ["documents", "Documents (PDF)", FileText], ["media", "Images", ImageIcon], ["links", "Links", Link2], ["contacts", "Contacts", ContactRound],
];

/** Configuration-type entities belong with administration, not with content. */
const administrationEntityLinks: [EntityName, string, typeof Newspaper][] = [["settings", "Site settings", Settings]];

/** Plain-language role names for the top bar. */
const roleLabels: Record<string, string> = { SUPER_ADMIN: "Super administrator", IET_ADMIN: "Institute administrator", DEPARTMENT_ADMIN: "Department administrator", EDITOR: "Editor" };

/**
 * Workspace chrome for every /admin page. The server layout (app/admin/layout.tsx)
 * has already verified the session before this renders; the sign-in page is
 * outside that layout and never uses this shell.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}

function pageTitle(pathname: string) {
  if (pathname === "/admin") return "Dashboard";
  if (pathname.includes("/content/")) {
    const entity = pathname.split("/content/")[1]?.split("/")[0];
    const match = [...contentLinks, ...administrationEntityLinks].find(([name]) => name === entity);
    return match ? match[1] : "Content";
  }
  if (pathname.startsWith("/admin/users")) return "Users";
  if (pathname.startsWith("/admin/audit")) return "Audit log";
  if (pathname.startsWith("/admin/department-contacts")) return "Department contacts";
  if (pathname.startsWith("/admin/account")) return "Account";
  return "Administration";
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((body) => setUser(body?.user || null)).catch(() => null); }, []);
  // The menu closes on navigation so a small screen never keeps a stale drawer open.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  /**
   * Sign out: the server deletes the session cookie (same-origin POST), then a
   * full navigation loads /admin/login so no signed-in state survives in the
   * browser. Every /admin page re-checks the session on the server, so the
   * workspace is unreachable until the next successful login.
   */
  const logout = async () => {
    setSigningOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { window.location.assign("/admin/login"); }
  };

  const entities = user ? visibleEntities(user).map((capability) => capability.entity) : [];
  const contentEntries = entities.map((slug) => contentLinks.find(([key]) => key === slug)).filter((entry): entry is [EntityName, string, typeof Newspaper] => Boolean(entry));
  const administrationEntries = entities.map((slug) => administrationEntityLinks.find(([key]) => key === slug)).filter((entry): entry is [EntityName, string, typeof Newspaper] => Boolean(entry));
  const showsAdministration = Boolean(user && (canManageUsers(user) || canViewAuditLogs(user) || visibleAdminSections(user).includes("departmentContacts") || administrationEntries.length > 0));

  const signOutButton = (className: string) => <button type="button" className={className} onClick={logout} disabled={signingOut} aria-label="Sign out"><LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}</button>;

  return <div className={`admin-shell${menuOpen ? " menu-open" : ""}`}>
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <button type="button" className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}<span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span></button>
        <Link href="/admin" className="admin-topbar-brand"><span className="wordmark-mark">IET</span><span>IET · DSMNRU</span></Link>
        <h1 className="admin-topbar-title">{pageTitle(pathname)}</h1>
      </div>
      <div className="admin-topbar-actions">
        {user && <span className="admin-topbar-user" title={roleLabels[user.role] || user.role}><strong>{user.name}</strong><span>{roleLabels[user.role] || user.role}</span></span>}
        {signOutButton("mini-button admin-signout")}
      </div>
    </header>
    <div className="admin-body">
      {menuOpen && <button type="button" className="admin-menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className="admin-sidebar" id="admin-sidebar">
        <Link href="/admin" className="admin-brand"><span className="wordmark-mark">IET</span><span><strong>Content management</strong><span>Institute of Engineering &amp; Technology · DSMNRU</span></span></Link>
        <nav className="admin-nav" aria-label="Admin navigation">
          <AdminLink href="/admin" label="Dashboard" icon={<Gauge size={15} />} active={pathname === "/admin"} />
          {contentEntries.length > 0 && <div className="admin-nav-label">Content</div>}
          {contentEntries.map(([slug, label, Icon]) => <AdminLink key={slug} href={`/admin/content/${slug}`} label={label} icon={<Icon size={15} />} active={pathname.startsWith(`/admin/content/${slug}`)} />)}
          {showsAdministration && <div className="admin-nav-label">Administration</div>}
          {user && canManageUsers(user) && <AdminLink href="/admin/users" label="Users" icon={<ShieldCheck size={15} />} active={pathname.startsWith("/admin/users")} />}
          {user && canViewAuditLogs(user) && <AdminLink href="/admin/audit" label="Audit log" icon={<Archive size={15} />} active={pathname.startsWith("/admin/audit")} />}
          {user && visibleAdminSections(user).includes("departmentContacts") && <AdminLink href="/admin/department-contacts" label="Department contacts" icon={<ContactRound size={15} />} active={pathname.startsWith("/admin/department-contacts")} />}
          {administrationEntries.map(([slug, label, Icon]) => <AdminLink key={slug} href={`/admin/content/${slug}`} label={label} icon={<Icon size={15} />} active={pathname.startsWith(`/admin/content/${slug}`)} />)}
          <div className="admin-nav-label">Account</div>
          {user && <AdminLink href="/admin/account" label="Account & security" icon={<KeyRound size={15} />} active={pathname.startsWith("/admin/account")} />}
          <AdminLink href="/" label="View public website" icon={<ExternalLink size={15} />} active={false} external />
          {signOutButton("admin-nav-signout")}
        </nav>
        <div className="admin-sidebar-bottom">{user ? <><strong style={{ color: "white", display: "block" }}>{user.name}</strong><span>{roleLabels[user.role] || user.role}</span></> : <span>Checking session…</span>}</div>
      </aside>
      <main className="admin-main">
        <div className="admin-content">{children}</div>
      </main>
    </div>
  </div>;
}

function AdminLink({ href, label, icon, active, external = false }: { href: string; label: string; icon: React.ReactNode; active: boolean; external?: boolean }) { return <Link href={href} className={active ? "active" : ""} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{icon}<span>{label}</span></Link>; }

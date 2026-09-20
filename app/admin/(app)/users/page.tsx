"use client";

import { DepartmentSelect, type DepartmentOption } from "@/components/department-select";
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENT } from "@/lib/password-policy";
import { adminRoles, roleScopeLabel } from "@/lib/user-roles";
import Link from "next/link";
import { Pencil, Save, ShieldCheck, UserPlus, UserX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type UserRecord = { id: string; email: string; name: string; role: string; departmentId?: string | null; active: boolean; sessionVersion: number; department?: { slug: string; name: string } | null };

const emptyForm = { email: "", name: "", password: "", role: "EDITOR", departmentId: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<null | { id: string; email: string; name: string; role: string; departmentId: string; password: string; active: boolean }>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = (targetPage = page) => { setLoading(true); fetch(`/api/admin/users?page=${targetPage}&limit=100`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load users"); setUsers(body.users || []); setTotal(body.total || 0); setTotalPages(body.totalPages || 1); setPage(body.page || 1); }).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(1); }, []);
  useEffect(() => {
    // The department list is read through the existing admin content endpoint;
    // the selector submits the department's internal id, never a typed value.
    const rows: DepartmentOption[] = [];
    const read = async (targetPage: number): Promise<void> => {
      const response = await fetch(`/api/admin/content?entity=departments&page=${targetPage}&limit=100`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to load departments");
      rows.push(...(body.records || []).map((record: DepartmentOption) => ({ id: record.id, name: record.name, status: record.status })));
      if (targetPage < (body.totalPages || 1)) return read(targetPage + 1);
    };
    read(1).then(() => setDepartments(rows)).catch((err) => setError(err.message));
  }, []);

  // Opening the editor moves focus into it, so keyboard and screen-reader
  // users land on the account they chose instead of staying on the table.
  useEffect(() => { if (editing) document.getElementById("edit-name")?.focus(); }, [editing?.id]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, departmentId: form.role === "DEPARTMENT_ADMIN" ? form.departmentId || null : null }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "Unable to create user"); return; }
    setForm(emptyForm); setMessage("Administrator created."); load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true); setError(""); setMessage("");
    const payload: Record<string, unknown> = { name: editing.name, role: editing.role, departmentId: editing.role === "DEPARTMENT_ADMIN" ? editing.departmentId || null : null, active: editing.active };
    if (editing.password) payload.password = editing.password;
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, data: payload }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Unable to update user"); return; }
    setEditing(null); setMessage("Account updated. Sessions were invalidated if the role, scope or password changed."); load();
  };

  const deactivate = async (id: string) => { if (!window.confirm("Deactivate this account and invalidate its sessions?")) return; const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); const body = await response.json().catch(() => ({})); if (!response.ok) { setError(body.error || "Unable to deactivate user"); return; } setMessage("Account deactivated and active sessions invalidated."); load(); };

  return <>
    <div className="entity-toolbar"><div><div className="admin-breadcrumb">Governance / User administration</div><h2>Administrator accounts</h2><p className="small">Manage named accounts, department scope and explicit session invalidation. Only department administrators are scoped to a department; every other role is institute-wide. Passwords are never displayed.</p></div><Link href="/admin/audit" className="button secondary small-button">Audit log</Link></div>
    {error && <div className="alert" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}

    <div className="admin-panel">
      <div className="admin-panel-head"><h3><UserPlus size={17} /> Create administrator</h3><span className="tag"><ShieldCheck size={13} /> Named access only</span></div>
      <form className="form-grid" onSubmit={create}>
        <div className="form-field"><label htmlFor="user-name">Name</label><input id="user-name" className="form-control" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="form-field"><label htmlFor="user-email">Email</label><input id="user-email" className="form-control" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
        <div className="form-field"><label htmlFor="user-password">Temporary password</label><input id="user-password" className="form-control" type="password" minLength={MIN_PASSWORD_LENGTH} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><span className="form-hint">{PASSWORD_REQUIREMENT} Share through an approved channel and rotate after first sign-in.</span></div>
        <div className="form-field"><label htmlFor="user-role">Role</label><select id="user-role" className="form-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, departmentId: "" })}>{adminRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select><span className="form-hint">{form.role === "DEPARTMENT_ADMIN" ? "Scoped to one department." : "Institute-wide role — no department is assigned."}</span></div>
        {/* The department selector is rendered only for the department-scoped role. */}
        {form.role === "DEPARTMENT_ADMIN" && <DepartmentSelect
          id="user-department"
          value={form.departmentId}
          onChange={(departmentId) => setForm({ ...form, departmentId })}
          options={departments}
          required
          hint="Search by department name. The account is scoped to the selected department's internal id."
        />}
        <div className="form-actions full"><button className="button small-button" type="submit">Create account</button></div>
      </form>
    </div>

    <div className="admin-panel" style={{ padding: 0, overflowX: "auto" }}>
      <table className="entity-table"><thead><tr><th>Account</th><th>Role</th><th>Scope</th><th>Sessions</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>Loading accounts…</td></tr> : users.map((user) => <tr key={user.id}>
          <td><strong>{user.name}</strong><br /><span className="small">{user.email}</span></td>
          <td><span className="status-pill review">{user.role.replaceAll("_", " ")}</span></td>
          <td>{roleScopeLabel(user.role, user.department?.name)}</td>
          <td>{user.sessionVersion}</td>
          <td>{user.active ? <span className="status-pill published">Active</span> : <span className="status-pill archived">Inactive</span>}</td>
          <td><div className="entity-actions"><button className="mini-button" onClick={() => { setError(""); setMessage(""); setEditing({ id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId || "", password: "", active: user.active }); }}><Pencil size={13} /> Edit</button>{user.active && <button className="mini-button danger" onClick={() => deactivate(user.id)}><UserX size={13} /> Deactivate</button>}</div></td>
        </tr>)}
      </tbody></table>
    </div>
    <div className="cta-row" style={{ marginTop: 12, justifyContent: "space-between" }}><span className="small">{total} account{total === 1 ? "" : "s"} · page {page} of {totalPages}</span><div style={{ display: "flex", gap: 8 }}><button className="button small-button secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button className="button small-button secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button></div></div>

    {editing && <div className="admin-panel" role="dialog" aria-label={`Edit ${editing.name}`}>
      <div className="admin-panel-head"><h3><Pencil size={16} /> Edit account</h3><button className="mini-button" aria-label="Close editor" onClick={() => setEditing(null)}><X size={14} /></button></div>
      <div className="form-grid">
        <div className="form-field"><label htmlFor="edit-name">Name</label><input id="edit-name" className="form-control" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></div>
        <div className="form-field"><label htmlFor="edit-email">Email</label><input id="edit-email" className="form-control" value={editing.email} disabled /></div>
        <div className="form-field"><label htmlFor="edit-role">Role</label><select id="edit-role" className="form-select" value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value, departmentId: "" })}>{adminRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select><span className="form-hint">{editing.role === "DEPARTMENT_ADMIN" ? "Scoped to one department." : "Institute-wide role — no department is assigned."}</span></div>
        <div className="form-field"><label htmlFor="edit-active">Account status</label><select id="edit-active" className="form-select" value={editing.active ? "active" : "inactive"} onChange={(event) => setEditing({ ...editing, active: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></select><span className="form-hint">Deactivating this account signs it out immediately.</span></div>
        {/* Same role-dependent rule as account creation. */}
        {editing.role === "DEPARTMENT_ADMIN" && <DepartmentSelect
          id="edit-department"
          value={editing.departmentId}
          onChange={(departmentId) => setEditing({ ...editing, departmentId })}
          options={departments}
          required
          hint="Search by department name. Switching to an institute-wide role clears this scope."
        />}
        <div className="form-field"><label htmlFor="edit-password">New temporary password (optional)</label><input id="edit-password" className="form-control" type="password" minLength={MIN_PASSWORD_LENGTH} value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} /><span className="form-hint">{PASSWORD_REQUIREMENT} Leave blank to keep the current password. Changing it signs the account out.</span></div>
      </div>
      <div className="form-actions"><button className="button secondary small-button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="button small-button" disabled={saving} onClick={saveEdit}><Save size={14} /> {saving ? "Saving…" : "Save account"}</button></div>
    </div>}
  </>;
}

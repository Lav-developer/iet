"use client";

import { DepartmentSelect, type DepartmentOption } from "@/components/department-select";
import { departmentContactRoleValues } from "@/lib/content-policy";
import type { SessionUser } from "@/lib/auth";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type FacultyOption = { id: string; slug: string; name: string; designation: string; status: string };
type ContactRow = { key: string; role: string; facultySlug: string };

/**
 * Department contact configuration.
 *
 * The public department page shows the contacts configured here, in this order,
 * each with the selected person's own name, designation, email and phone. A
 * department administrator edits their own department only — the department is
 * taken from their account, never typed — while institute-wide administrators
 * pick a department by name.
 */
export function DepartmentContacts() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [assignedDepartment, setAssignedDepartment] = useState("");
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDepartmentAdmin = user?.role === "DEPARTMENT_ADMIN";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setUser(body?.user || null))
      .catch(() => setUser(null));
  }, []);

  // Institute-wide roles choose a department by name; the internal id is never
  // typed by anybody.
  useEffect(() => {
    if (!user || user.role === "DEPARTMENT_ADMIN") return;
    fetch("/api/admin/content?entity=departments&page=1&limit=100")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load departments.");
        setDepartments((body.records || []).map((record: DepartmentOption) => ({ id: record.id, name: record.name, status: record.status })));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to load departments."));
  }, [user]);

  const targetDepartmentId = isDepartmentAdmin ? user?.departmentId || "" : departmentId;

  useEffect(() => {
    if (!user) return;
    if (!targetDepartmentId) { setFaculty([]); setRows([]); setLoading(false); return; }
    setLoading(true);
    fetch(`/api/admin/department-contacts?departmentId=${encodeURIComponent(targetDepartmentId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load department contacts.");
        setFaculty(body.faculty || []);
        setAssignedDepartment(body.department?.name || "");
        setRows((body.contacts || []).map((contact: { id: string; role: string; facultySlug: string }, index: number) => ({ key: contact.id || `row-${index}`, role: contact.role, facultySlug: contact.facultySlug })));
        setError("");
      })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Unable to load department contacts."); setRows([]); setFaculty([]); })
      .finally(() => setLoading(false));
  }, [user, targetDepartmentId, isDepartmentAdmin]);

  const selectedDepartmentName = useMemo(
    () => departments.find((option) => option.id === targetDepartmentId)?.name || "",
    [departments, targetDepartmentId],
  );

  const update = (index: number, patch: Partial<ContactRow>) => setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  const add = () => setRows((current) => [...current, { key: `new-${current.length}-${Date.now()}`, role: departmentContactRoleValues[0], facultySlug: faculty[0]?.slug || "" }]);
  const remove = (index: number) => setRows((current) => current.filter((_, position) => position !== index));

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/admin/department-contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId: targetDepartmentId, contacts: rows.map((row, index) => ({ role: row.role, facultySlug: row.facultySlug, order: index })) }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Unable to save department contacts."); return; }
    setFaculty(body.faculty || []);
    setRows((body.contacts || []).map((contact: { id: string; role: string; facultySlug: string }, index: number) => ({ key: contact.id || `row-${index}`, role: contact.role, facultySlug: contact.facultySlug })));
    setMessage(`Department contacts saved. The public page shows ${rows.length ? "these people" : "the “not available” fallback"} immediately.`);
  };

  const removable = rows.length > 1;

  return <>
    <div className="entity-toolbar">
      <div>
        <div className="admin-breadcrumb">Governance / Department contacts</div>
        <h2>Department contacts</h2>
        <p className="small">The public department page shows the people configured here — a Coordinator, a Department In-Charge, a Head of Department or any other recorded responsibility — each with that person&apos;s own name, designation, email and phone. Faculty order never decides the contact.</p>
      </div>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}

    <div className="admin-panel">
      <div className="admin-panel-head"><h3>Responsibility configuration</h3><span className="tag">Explicit configuration</span></div>
      <div className="form-grid">
        {isDepartmentAdmin
          ? <div className="form-field"><span className="form-label">Department</span><p className="form-control" style={{ background: "var(--paper-2)" }}>{assignedDepartment || "Your assigned department"}</p><span className="form-hint">Your account is scoped to this department; it comes from your sign-in, never typed.</span></div>
          : <DepartmentSelect id="contact-department" value={departmentId} onChange={(id) => setDepartmentId(id)} options={departments} label="Department" hint="Search by department name. The internal id is never entered by hand." />}
      </div>

      {!targetDepartmentId && <p className="small">{isDepartmentAdmin ? "Your account is not assigned to a department yet. Ask an institute administrator to assign one." : "Select a department to configure its contacts."}</p>}

      {targetDepartmentId && (loading ? <p className="small">Loading department contacts…</p> : <>
        {faculty.length === 0 && <div className="alert" role="status">This department has no faculty records yet. Add faculty first, then configure a contact.</div>}
        <p className="form-hint">{isDepartmentAdmin ? "" : `${selectedDepartmentName || "Selected department"} · `}Only this department&apos;s faculty can be selected.</p>
        {rows.map((row, index) => <div className="social-link-row" key={row.key}>
          <input
            className="form-control"
            aria-label={`Responsibility ${index + 1}`}
            list="department-contact-roles"
            placeholder="Coordinator"
            value={row.role}
            onChange={(event) => update(index, { role: event.target.value })}
          />
          <select
            className="form-select"
            aria-label={`Faculty member ${index + 1}`}
            value={row.facultySlug}
            onChange={(event) => update(index, { facultySlug: event.target.value })}
          >
            <option value="">Select a faculty member…</option>
            {faculty.map((person) => <option key={person.id} value={person.slug}>{person.name} — {person.designation}{person.status !== "PUBLISHED" ? ` (${person.status.toLowerCase()})` : ""}</option>)}
          </select>
          <button type="button" className="mini-button danger" onClick={() => remove(index)}><Trash2 size={13} /> Remove</button>
        </div>)}
        <datalist id="department-contact-roles">{departmentContactRoleValues.map((role) => <option key={role} value={role} />)}</datalist>
        <div className="cta-row" style={{ marginTop: 12 }}>
          <button type="button" className="button secondary small-button" onClick={add} disabled={!faculty.length}><Plus size={14} /> Add responsibility</button>
          <button type="button" className="button small-button" onClick={save} disabled={saving || !targetDepartmentId}><Save size={14} /> {saving ? "Saving…" : "Save contacts"}</button>
        </div>
        {!removable && rows.length === 1 && <p className="form-hint">Removing this entry leaves the department without a published contact card.</p>}
      </>)}
    </div>
  </>;
}


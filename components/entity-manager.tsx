"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EntityName } from "@/lib/types";

const configs: Record<EntityName, { title: string; description: string; titleField: string; fields: { key: string; label: string; type?: "textarea" | "select" | "number" | "asset"; options?: string[]; full?: boolean; hint?: string }[] }> = {
  departments: { title: "Departments", description: "Academic units and their connected content.", titleField: "name", fields: [
    { key: "name", label: "Department name" }, { key: "shortName", label: "Short name" }, { key: "slug", label: "URL slug", hint: "Use lowercase words separated by hyphens." }, { key: "established", label: "Established / source marker" }, { key: "overview", label: "Overview", type: "textarea", full: true }, { key: "sourceNote", label: "Source note", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  programs: { title: "Programs", description: "Programmes with level, duration, seat matrix and department relationships.", titleField: "title", fields: [
    { key: "title", label: "Programme title" }, { key: "shortTitle", label: "Short title" }, { key: "slug", label: "URL slug" }, { key: "level", label: "Level" }, { key: "duration", label: "Duration" }, { key: "approvedSeats", label: "Approved seats", type: "number" }, { key: "departmentSlug", label: "Department slug", hint: "Use the related department URL slug." }, { key: "laboratorySlugs", label: "Laboratory slugs", hint: "Comma-separated laboratory slugs." }, { key: "summary", label: "Summary", type: "textarea", full: true }, { key: "eligibility", label: "Eligibility (only if verified)", type: "textarea", full: true }, { key: "admissionNote", label: "Admissions hand-off note", type: "textarea", full: true }, { key: "sourceNote", label: "Source note", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  faculty: { title: "Faculty & staff", description: "People records, roles and department relationships.", titleField: "name", fields: [
    { key: "name", label: "Name" }, { key: "slug", label: "URL slug" }, { key: "designation", label: "Designation", hint: "Include (Coordinator) for the department coordinator." }, { key: "profileImageId", label: "Profile photograph", type: "asset", full: true }, { key: "cvUrl", label: "External CV URL", hint: "HTTPS only. Takes precedence over the CV document if both are set." }, { key: "cvDocumentId", label: "CV PDF document", type: "asset", full: true }, { key: "departmentSlug", label: "Department slug" }, { key: "type", label: "Person type", hint: "FACULTY, LEADERSHIP, LABORATORY STAFF or NON-TEACHING STAFF" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "qualification", label: "Qualification", type: "textarea" }, { key: "researchInterests", label: "Research interests", type: "textarea", hint: "Comma-separated values; only publish verified interests." }, { key: "researchAreaSlugs", label: "Research area slugs", hint: "Comma-separated normalized research-area slugs." }, { key: "laboratorySlugs", label: "Laboratory slugs", hint: "Comma-separated normalized laboratory slugs." }, { key: "profile", label: "Profile", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  laboratories: { title: "Laboratories", description: "Facilities connected to programmes, people and research.", titleField: "name", fields: [
    { key: "name", label: "Laboratory name" }, { key: "slug", label: "URL slug" }, { key: "departmentSlug", label: "Department slug" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "equipment", label: "Equipment / inventory", type: "textarea", full: true }, { key: "courses", label: "Courses supported", type: "textarea" }, { key: "researchRelevance", label: "Research relevance", type: "textarea" }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  researchAreas: { title: "Research areas", description: "Approved research domains with relationship hooks.", titleField: "name", fields: [
    { key: "name", label: "Research area" }, { key: "slug", label: "URL anchor / slug" }, { key: "facultySlugs", label: "Faculty slugs", hint: "Comma-separated faculty slugs." }, { key: "departmentSlugs", label: "Department slugs", hint: "Comma-separated department slugs." }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "sourceNote", label: "Source note", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  projects: { title: "Projects", description: "Research and innovation projects. Publish only approved records.", titleField: "title", fields: [
    { key: "title", label: "Project title" }, { key: "slug", label: "URL slug" }, { key: "departmentSlug", label: "Department slug" }, { key: "sponsor", label: "Sponsor" }, { key: "facultySlugs", label: "Faculty slugs", hint: "Comma-separated faculty slugs." }, { key: "laboratorySlugs", label: "Laboratory slugs", hint: "Comma-separated laboratory slugs." }, { key: "summary", label: "Summary", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  publications: { title: "Publications", description: "Bibliographic records with authors and source links.", titleField: "title", fields: [
    { key: "title", label: "Title", type: "textarea", full: true }, { key: "slug", label: "URL slug" }, { key: "venue", label: "Venue / journal" }, { key: "year", label: "Year", type: "number" }, { key: "doi", label: "DOI" }, { key: "url", label: "External URL" }, { key: "abstract", label: "Abstract", type: "textarea", full: true }, { key: "departmentSlug", label: "Department slug" }, { key: "authorSlugs", label: "Author faculty slugs", hint: "Comma-separated normalized faculty slugs." }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  achievements: { title: "Achievements", description: "Verified student, team, faculty and institutional achievements.", titleField: "title", fields: [
    { key: "title", label: "Achievement" }, { key: "category", label: "Category" }, { key: "recipient", label: "Student / team / faculty" }, { key: "year", label: "Year", type: "number" }, { key: "eventName", label: "Event" }, { key: "departmentSlug", label: "Department slug" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  events: { title: "Events", description: "IET-specific workshops, seminars, conferences and activities.", titleField: "title", fields: [
    { key: "title", label: "Event title" }, { key: "slug", label: "URL slug" }, { key: "startsAt", label: "Starts at", hint: "ISO date/time is accepted." }, { key: "endsAt", label: "Ends at" }, { key: "location", label: "Location" }, { key: "departmentSlug", label: "Department slug" }, { key: "organizationId", label: "Student organization", type: "asset" }, { key: "registrationUrl", label: "Registration URL" }, { key: "summary", label: "Summary", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  organizations: { title: "Student organizations", description: "Clubs, chapters and student groups.", titleField: "name", fields: [
    { key: "name", label: "Organization name" }, { key: "slug", label: "URL slug" }, { key: "departmentSlug", label: "Department slug" }, { key: "contactUrl", label: "Official contact URL" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  pages: { title: "Pages", description: "Structured institutional pages with localized content ready for review.", titleField: "title", fields: [
    { key: "title", label: "Page title" }, { key: "slug", label: "URL slug" }, { key: "locale", label: "Locale", hint: "Use en now; add hi after institutional review." }, { key: "excerpt", label: "Excerpt", type: "textarea" }, { key: "body", label: "Page body", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  links: { title: "Links", description: "Official university and IET resource links with clear ownership.", titleField: "label", fields: [
    { key: "label", label: "Link label" }, { key: "url", label: "URL" }, { key: "owner", label: "Owner", hint: "DSMNRU or IET" }, { key: "order", label: "Order", type: "number" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  contacts: { title: "Contacts", description: "Approved institute, department and university contact channels.", titleField: "label", fields: [
    { key: "label", label: "Label" }, { key: "name", label: "Name" }, { key: "category", label: "Category", hint: "IET, DSMNRU or department" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
  settings: { title: "Site settings", description: "Institution-owned configuration values and provenance banners.", titleField: "key", fields: [
    { key: "key", label: "Setting key" }, { key: "value", label: "Value", type: "textarea", full: true }, { key: "description", label: "Description", type: "textarea", full: true },
  ] },
  media: { title: "Media library", description: "Uploaded images and metadata with alt text and captions.", titleField: "key", fields: [
    { key: "key", label: "Storage key" }, { key: "url", label: "Public / signed URL" }, { key: "mimeType", label: "MIME type" }, { key: "sizeBytes", label: "Size in bytes", type: "number" }, { key: "altText", label: "Alt text", type: "textarea", full: true }, { key: "caption", label: "Caption", type: "textarea", full: true },
  ] },
  documents: { title: "Documents", description: "PDFs and institutional documents with metadata and publication workflow.", titleField: "title", fields: [
    { key: "title", label: "Document title" }, { key: "key", label: "Storage key" }, { key: "url", label: "Public / signed URL" }, { key: "mimeType", label: "MIME type" }, { key: "sizeBytes", label: "Size in bytes", type: "number" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "altText", label: "Accessible title / alt text", type: "textarea", full: true }, { key: "status", label: "Workflow status", type: "select", options: ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] },
  ] },
};

export { isEntityName } from "@/lib/content-policy";

export function EntityManager({ entity }: { entity: EntityName }) {
  const config = configs[entity]; const [records, setRecords] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [editing, setEditing] = useState<any | null>(null); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [totalPages, setTotalPages] = useState(1);
  const load = (targetPage = page) => { setLoading(true); fetch(`/api/admin/content?entity=${entity}&page=${targetPage}&limit=100`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not load content"); setRecords(body.records || []); setTotal(body.total || 0); setTotalPages(body.totalPages || 1); setPage(body.page || 1); }).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(1); }, [entity]);
  const startNew = () => { const blank: Record<string, any> = {}; config.fields.forEach((field) => { blank[field.key] = field.type === "number" ? "" : field.key === "status" ? "DRAFT" : ""; }); setEditing(blank); setMessage(""); };
  const save = async (values: Record<string, any>) => {
    setSaving(true); setError("");
    const isExisting = Boolean(values.id);
    try {
      const response = await fetch("/api/admin/content", { method: isExisting ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id: values.id, data: values }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save record");
      setEditing(null); setMessage(isExisting ? "Record updated." : "Draft record created."); load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save record"); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { if (!window.confirm("Delete this record? This action is audit logged.")) return; const response = await fetch(`/api/admin/content?entity=${entity}&id=${encodeURIComponent(id)}`, { method: "DELETE" }); const body = await response.json().catch(() => ({})); if (!response.ok) { setError(body.error || "Could not delete record"); return; } setMessage("Record deleted."); load(); };
  const titleFor = (record: any) => record[config.titleField] || record.name || record.title || record.key || record.id;
  const preview = (record: any) => record.overview || record.summary || record.description || record.body || record.value || "";
  return <><div className="entity-toolbar"><div><div className="admin-breadcrumb">Content / {config.title}</div><h2>{config.title}</h2><p className="small">{config.description}</p></div><button className="button small-button" onClick={startNew}><Plus size={15} /> New record</button></div>{(entity === "media" || entity === "documents") && <UploadPanel entity={entity} onDone={() => { setMessage("Upload stored and metadata record created."); load(); }} />}{error && <div className="alert">{error}</div>}{message && <div className="success">{message}</div>}{loading ? <div className="admin-panel"><p className="small">Loading records…</p></div> : <><div className="admin-panel" style={{ padding: 0, overflowX: "auto" }}><table className="entity-table"><thead><tr><th>Record</th><th>Summary</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{titleFor(record)}</strong><br /><span className="small">{record.slug || record.key || record.id}</span></td><td><span className="small">{String(preview(record)).slice(0, 150)}{String(preview(record)).length > 150 ? "…" : ""}</span></td><td>{record.status ? <span className={`status-pill ${String(record.status).toLowerCase()}`}>{record.status}</span> : <span className="tag">setting</span>}</td><td><span className="small">{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString("en-IN") : "seed"}</span></td><td><div className="entity-actions"><button className="mini-button" onClick={() => setEditing(normalizeForForm(record, config.fields))}>Edit</button><button className="mini-button danger" onClick={() => remove(record.id)}><Trash2 size={13} /></button></div></td></tr>)}{records.length === 0 && <tr><td colSpan={5}><div className="empty-state">No records found.</div></td></tr>}</tbody></table></div><div className="cta-row" style={{ marginTop: 10, justifyContent: "space-between" }}><span className="small">{total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}</span><div style={{ display: "flex", gap: 8 }}><button className="button small-button secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button className="button small-button secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button></div></div></>}{editing && <EditorModal config={config} value={editing} saving={saving} error={error} onClose={() => setEditing(null)} onSave={save} />}</>;
}

function UploadPanel({ entity, onDone }: { entity: "media" | "documents"; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [title, setTitle] = useState(""); const [altText, setAltText] = useState(""); const [caption, setCaption] = useState(""); const [status, setStatus] = useState("DRAFT"); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const upload = async () => { if (!file) { setError("Choose a file first."); return; } setBusy(true); setError(""); const form = new FormData(); form.append("file", file); form.append("collection", entity); form.append("title", title || file.name); form.append("altText", altText); form.append("caption", caption); form.append("status", status); const response = await fetch("/api/admin/media/upload", { method: "POST", body: form }); const body = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) { setError(body.error || "Upload failed"); return; } setFile(null); setTitle(""); setAltText(""); setCaption(""); onDone(); };
  return <div className="admin-panel" style={{ marginBottom: 15, background: "var(--paper-2)" }}><div className="admin-panel-head"><h3>Upload {entity === "media" ? "image / media" : "PDF / document"}</h3><span className="small">Demo stores locally; production uses object storage.</span></div><div className="form-grid"><div className="form-field"><label htmlFor="upload-file">File</label><input id="upload-file" className="form-control" type="file" accept={entity === "media" ? "image/png,image/jpeg,image/webp,image/gif" : "application/pdf"} onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div className="form-field"><label htmlFor="upload-title">Title</label><input id="upload-title" className="form-control" value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="form-field"><label htmlFor="upload-alt">Alt text / accessible title</label><input id="upload-alt" className="form-control" value={altText} onChange={(event) => setAltText(event.target.value)} /></div><div className="form-field"><label htmlFor="upload-caption">Caption</label><input id="upload-caption" className="form-control" value={caption} onChange={(event) => setCaption(event.target.value)} /></div>{entity === "documents" && <div className="form-field"><label htmlFor="upload-status">Workflow status</label><select id="upload-status" className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}><option>DRAFT</option><option>REVIEW</option><option>PUBLISHED</option></select></div>}</div>{error && <div className="alert">{error}</div>}<button className="button small-button" style={{ marginTop: 14 }} onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload and create metadata"}</button></div>;
}

function normalizeForForm(record: any, fields: { key: string }[]) { const clone = { ...record }; fields.forEach((field) => { if (["researchInterests", "researchAreaSlugs", "laboratorySlugs", "facultySlugs", "departmentSlugs", "authorSlugs"].includes(field.key) && Array.isArray(clone[field.key])) clone[field.key] = clone[field.key].join(", "); }); return clone; }

function EditorModal({ config, value, saving, error, onClose, onSave }: {
  config: (typeof configs)[EntityName]; value: Record<string, any>; saving: boolean; error: string;
  onClose: () => void; onSave: (value: Record<string, any>) => void;
}) {
  const [form, setForm] = useState(value);
  const [uploads, setUploads] = useState<Record<string, boolean>>({});
  const dialog = useRef<HTMLDivElement>(null);
  const uploading = Object.values(uploads).some(Boolean);
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div ref={dialog} tabIndex={-1} className="accessibility-panel" role="dialog" aria-modal="true" aria-label={`Edit ${config.title}`} onKeyDown={(event) => {
    if (event.key === "Escape" && !uploading && !saving) onClose();
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }} style={{ width: "min(680px, calc(100vw - 30px))", right: 15, bottom: 15, top: 15, overflowY: "auto" }}>
    <button className="panel-close" aria-label="Close editor" disabled={uploading || saving} onClick={onClose}><X size={17} /></button>
    <div className="eyebrow">{form.id ? "Edit record" : "New draft"}</div><h2>{config.title}</h2>
    {error && <div className="alert" role="alert">{error}</div>}
    <div className="form-grid">{config.fields.map((field) => <div className={`form-field ${field.full ? "full" : ""}`} key={field.key}>
      <label htmlFor={`field-${field.key}`}>{field.label}</label>
      {field.type === "asset" ? <AssetPicker fieldKey={field.key} value={form[field.key] || ""} departmentSlug={form.departmentSlug} onChange={(value) => set(field.key, value)} onBusyChange={(busy) => setUploads((current) => ({ ...current, [field.key]: busy }))} />
        : field.type === "textarea" ? <textarea id={`field-${field.key}`} className="form-textarea" value={form[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} />
        : field.type === "select" ? <select id={`field-${field.key}`} className="form-select" value={form[field.key] ?? field.options?.[0] ?? ""} onChange={(event) => set(field.key, event.target.value)}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>
        : <input id={`field-${field.key}`} className="form-control" type={field.type === "number" ? "number" : field.key === "cvUrl" ? "url" : "text"} value={form[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} />}
      {field.hint && <div className="form-hint">{field.hint}</div>}
    </div>)}</div>
    <div className="form-actions"><button className="button secondary small-button" disabled={uploading || saving} onClick={onClose}>Cancel</button><button className="button small-button" disabled={saving || uploading} onClick={() => onSave(form)}><Save size={14} /> {saving ? "Saving…" : uploading ? "Uploading…" : "Save record"}</button></div>
  </div>;
}


function AssetPicker({ fieldKey, value, departmentSlug, onChange, onBusyChange }: { fieldKey: string; value: string; departmentSlug?: string; onChange: (id: string) => void; onBusyChange: (busy: boolean) => void }) {
  const collection = fieldKey === "profileImageId" ? "media" : fieldKey === "cvDocumentId" ? "documents" : "organizations";
  const [records, setRecords] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [altText, setAltText] = useState("");
  const load = async () => {
    try {
      const rows: Record<string, any>[] = [];
      let page = 1, totalPages = 1;
      do {
        const response = await fetch(`/api/admin/content?entity=${collection}&page=${page}&limit=100`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load library.");
        rows.push(...body.records); totalPages = body.totalPages; page++;
      } while (page <= totalPages);
      setRecords(rows);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load library."); }
  };
  useEffect(() => { void load(); }, [collection]);
  const upload = async (file?: File) => {
    if (!file || collection === "organizations") return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const alt = collection === "media" ? altText.trim() : file.name;
      if (!alt) { setError("Enter alternative text before uploading a photograph."); return; }
      const form = new FormData();
      form.append("file", file); form.append("collection", collection); form.append("altText", alt); form.append("title", file.name); form.append("status", "DRAFT");
      if (departmentSlug) form.append("departmentSlug", departmentSlug);
      const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Upload failed.");
      await load(); onChange(body.record.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return <div>
    <select id={`field-${fieldKey}`} className="form-select" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">None</option>
      {value && !records.some((row) => row.id === value) && <option value={value}>Current selection (unavailable in this library)</option>}
      {records.map((row) => <option key={row.id} value={row.id}>{row.title || row.name || row.altText || row.key}{row.status ? ` · ${row.status}` : ""}</option>)}
    </select>
    {collection === "media" && <><label className="form-hint" htmlFor="photo-alt">Alternative text for a new photograph</label><input id="photo-alt" className="form-control" value={altText} maxLength={300} placeholder="Portrait of Dr. …" onChange={(event) => setAltText(event.target.value)} /></>}
    {collection !== "organizations" && <><label className="form-hint" htmlFor={`upload-${fieldKey}`}>Or upload {collection === "media" ? "a photograph" : "a PDF"}</label><input id={`upload-${fieldKey}`} type="file" disabled={busy} accept={collection === "media" ? "image/png,image/jpeg,image/webp,image/gif" : "application/pdf"} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></>}
    {collection === "documents" && <p className="form-hint">New PDFs are drafts. Publish the document in Documents before it appears on the public profile.</p>}
    {busy && <p role="status">Uploading…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}

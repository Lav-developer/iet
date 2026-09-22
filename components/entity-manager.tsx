"use client";

import { DepartmentSelect, type DepartmentOption } from "@/components/department-select";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EntityName } from "@/lib/types";
import { slugify, workflowActions, type EntityCapabilityDetail, type WorkflowAction } from "@/lib/content-policy";

/**
 * Editor configuration for one content type.
 *
 * Labels and hints are written for non-technical university staff: no
 * database identifiers, storage keys, MIME types or Prisma vocabulary. The
 * public web address ("slug") is the only technical-looking value that is
 * shown, because it is part of the public page URL; it is filled in
 * automatically from the name or title when left blank.
 */
type FieldType = "textarea" | "select" | "number" | "asset" | "date" | "department";
type FieldConfig = { key: string; label: string; type?: FieldType; options?: string[]; optionLabels?: Record<string, string>; full?: boolean; hint?: string; required?: boolean };
type EntityConfig = { title: string; singular: string; description: string; titleField: string; fields: FieldConfig[] };

const WEB_ADDRESS_HINT = "The last part of this page's web address, in lowercase words joined by hyphens. Leave blank to create it from the name.";
const LINKED_LABORATORIES_HINT = "Web addresses of the laboratories, separated by commas (as shown in Laboratories). Leave blank if none.";
const LINKED_FACULTY_HINT = "Web addresses of the faculty members, separated by commas (as shown in Faculty & staff). Leave blank if none.";

const configs: Record<EntityName, EntityConfig> = {
  departments: { title: "Departments", singular: "department", description: "Academic departments and their public profile.", titleField: "name", fields: [
    { key: "name", label: "Department name", required: true }, { key: "shortName", label: "Short name (abbreviation)" }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "established", label: "Year established" }, { key: "overview", label: "Overview", type: "textarea", full: true }, { key: "sourceNote", label: "Internal source note (not shown publicly)", type: "textarea", full: true },
  ] },
  programs: { title: "Programmes", singular: "programme", description: "Programmes with level, duration, approved seats and department.", titleField: "title", fields: [
    { key: "title", label: "Programme title", required: true }, { key: "shortTitle", label: "Short title" }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "level", label: "Level", hint: "For example: Undergraduate, Postgraduate." }, { key: "duration", label: "Duration", hint: "For example: 4 years." }, { key: "approvedSeats", label: "Approved seats", type: "number" }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "laboratorySlugs", label: "Linked laboratories", hint: LINKED_LABORATORIES_HINT }, { key: "summary", label: "Summary", type: "textarea", full: true }, { key: "eligibility", label: "Eligibility (only if verified)", type: "textarea", full: true }, { key: "admissionNote", label: "Admissions note", type: "textarea", full: true }, { key: "sourceNote", label: "Internal source note (not shown publicly)", type: "textarea", full: true },
  ] },
  faculty: { title: "Faculty & staff", singular: "person", description: "Faculty and staff profiles with their department.", titleField: "name", fields: [
    { key: "name", label: "Full name", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "designation", label: "Designation", hint: "Add (Coordinator) after the designation for the department coordinator." }, { key: "profileImageId", label: "Profile photograph", type: "asset", full: true }, { key: "cvUrl", label: "Link to CV on another website (optional)", hint: "Must start with https://. If both a link and a CV PDF are set, the link is used." }, { key: "cvDocumentId", label: "CV as PDF (optional)", type: "asset", full: true }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "type", label: "Role type", type: "select", options: ["FACULTY", "LEADERSHIP", "LABORATORY STAFF", "NON-TEACHING STAFF"], optionLabels: { FACULTY: "Faculty", LEADERSHIP: "Leadership", "LABORATORY STAFF": "Laboratory staff", "NON-TEACHING STAFF": "Non-teaching staff" } }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "qualification", label: "Qualification", type: "textarea" }, { key: "researchInterests", label: "Research interests", type: "textarea", hint: "Separate interests with commas. Publish only verified interests." }, { key: "researchAreaSlugs", label: "Linked research areas", hint: "Web addresses of the research areas, separated by commas (as shown in Research). Leave blank if none." }, { key: "laboratorySlugs", label: "Linked laboratories", hint: LINKED_LABORATORIES_HINT }, { key: "profile", label: "Profile / biography", type: "textarea", full: true },
  ] },
  laboratories: { title: "Laboratories", singular: "laboratory", description: "Laboratories and facilities with their department.", titleField: "name", fields: [
    { key: "name", label: "Laboratory name", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "equipment", label: "Equipment / facilities", type: "textarea", full: true }, { key: "courses", label: "Courses supported", type: "textarea" }, { key: "researchRelevance", label: "Research relevance", type: "textarea" },
  ] },
  researchAreas: { title: "Research areas", singular: "research area", description: "Research areas and the people connected to them.", titleField: "name", fields: [
    { key: "name", label: "Research area", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "facultySlugs", label: "Linked faculty members", hint: LINKED_FACULTY_HINT }, { key: "departmentSlugs", label: "Linked departments", hint: "Web addresses of the departments, separated by commas. Leave blank if none." }, { key: "description", label: "Description", type: "textarea", full: true }, { key: "sourceNote", label: "Internal source note (not shown publicly)", type: "textarea", full: true },
  ] },
  projects: { title: "Projects", singular: "project", description: "Research and innovation projects. Publish only approved records.", titleField: "title", fields: [
    { key: "title", label: "Project title", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "sponsor", label: "Sponsor / funding agency" }, { key: "facultySlugs", label: "Linked faculty members", hint: LINKED_FACULTY_HINT }, { key: "laboratorySlugs", label: "Linked laboratories", hint: LINKED_LABORATORIES_HINT }, { key: "summary", label: "Summary", type: "textarea", full: true },
  ] },
  publications: { title: "Publications", singular: "publication", description: "Publications with authors and source links.", titleField: "title", fields: [
    { key: "title", label: "Title", type: "textarea", full: true, required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "venue", label: "Journal / conference" }, { key: "year", label: "Year", type: "number" }, { key: "doi", label: "DOI (optional)" }, { key: "url", label: "Link to the publication (optional)", hint: "Must start with http:// or https://." }, { key: "abstract", label: "Abstract", type: "textarea", full: true }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "authorSlugs", label: "IET authors", hint: LINKED_FACULTY_HINT },
  ] },
  achievements: { title: "Achievements", singular: "achievement", description: "Verified student, team, faculty and institutional achievements.", titleField: "title", fields: [
    { key: "title", label: "Achievement", required: true }, { key: "category", label: "Category", hint: "For example: Student achievement, Faculty award." }, { key: "recipient", label: "Student / team / faculty member" }, { key: "year", label: "Year", type: "number" }, { key: "eventName", label: "Event or competition" }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "description", label: "Description", type: "textarea", full: true },
  ] },
  events: { title: "Events", singular: "event", description: "Workshops, seminars, conferences and student activities.", titleField: "title", fields: [
    { key: "title", label: "Event title", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "startsAt", label: "Start date", type: "date" }, { key: "endsAt", label: "End date (optional)", type: "date" }, { key: "location", label: "Venue / location" }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "organizationId", label: "Student organization (optional)", type: "asset" }, { key: "registrationUrl", label: "Registration link (optional)", hint: "Must start with http:// or https://." }, { key: "summary", label: "Summary", type: "textarea", full: true },
  ] },
  notices: { title: "Notices", singular: "notice", description: "Notice board: text notices and PDF notices.", titleField: "title", fields: [
    { key: "title", label: "Notice title", required: true }, { key: "noticeType", label: "Notice type", type: "select", options: ["TEXT", "PDF"], optionLabels: { TEXT: "Text notice (read on the website)", PDF: "PDF notice (opens an uploaded PDF)" } }, { key: "documentId", label: "Notice PDF", type: "asset", full: true, hint: "For a PDF notice: upload the PDF here or choose one that was uploaded earlier. When the notice is published, its PDF is made public automatically — no separate step in Documents is needed." }, { key: "noticeDate", label: "Notice date", type: "date" }, { key: "expiryDate", label: "Remove from the notice board after (optional)", type: "date", hint: "Leave blank to keep the notice listed. After this date the notice leaves the public listings." }, { key: "category", label: "Category (optional)", hint: "For example: Examination, Admission, Event." }, { key: "departmentSlug", label: "Department (optional)", type: "department", hint: "Choose a department by name, or keep “Institute-wide (no department)” for an institutional notice." }, { key: "slug", label: "Web address (optional)", hint: "Created from the title when left blank." }, { key: "summary", label: "Short summary (optional)", type: "textarea", full: true }, { key: "body", label: "Notice text (for text notices)", type: "textarea", full: true, hint: "Required for a text notice. Line breaks are kept." },
  ] },
  organizations: { title: "Student organizations", singular: "student organization", description: "Clubs, chapters and student groups.", titleField: "name", fields: [
    { key: "name", label: "Organization name", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "departmentSlug", label: "Department", type: "department" }, { key: "contactUrl", label: "Official website or contact link (optional)", hint: "Must start with http:// or https://." }, { key: "description", label: "Description", type: "textarea", full: true },
  ] },
  pages: { title: "Pages", singular: "page", description: "Institutional pages such as About, Admissions and Accessibility.", titleField: "title", fields: [
    { key: "title", label: "Page title", required: true }, { key: "slug", label: "Web address", hint: WEB_ADDRESS_HINT }, { key: "locale", label: "Language", hint: "Use “en” for English." }, { key: "excerpt", label: "Short introduction", type: "textarea" }, { key: "body", label: "Page text", type: "textarea", full: true, hint: "Plain text. Line breaks are kept." },
  ] },
  links: { title: "Links", singular: "link", description: "Official university and IET resource links.", titleField: "label", fields: [
    { key: "label", label: "Link text", required: true }, { key: "url", label: "Web address (URL)", hint: "Must start with http:// or https://." }, { key: "owner", label: "Provided by", type: "select", options: ["DSMNRU", "IET"] }, { key: "order", label: "Display order", type: "number", hint: "Lower numbers appear first." }, { key: "description", label: "Description", type: "textarea", full: true },
  ] },
  contacts: { title: "Contacts", singular: "contact", description: "Institute, department and university contact channels.", titleField: "label", fields: [
    { key: "label", label: "Contact heading", required: true, hint: "For example: Faculty leadership, University contact." }, { key: "name", label: "Name / office" }, { key: "category", label: "Belongs to", hint: "IET, DSMNRU or the department name." }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address", type: "textarea", full: true },
  ] },
  settings: { title: "Site settings", singular: "setting", description: "Institution-owned configuration values.", titleField: "key", fields: [
    { key: "key", label: "Setting name", required: true }, { key: "value", label: "Value", type: "textarea", full: true }, { key: "description", label: "Description", type: "textarea", full: true },
  ] },
  media: { title: "Images", singular: "image", description: "Uploaded photographs and images with their descriptions.", titleField: "altText", fields: [
    { key: "altText", label: "Description for screen readers (alternative text)", type: "textarea", full: true, required: true }, { key: "caption", label: "Caption (optional)", type: "textarea", full: true },
  ] },
  documents: { title: "Documents (PDF)", singular: "document", description: "Uploaded PDF documents. A PDF used by a notice is published together with the notice.", titleField: "title", fields: [
    { key: "title", label: "Document title", required: true }, { key: "departmentSlug", label: "Department", type: "department", hint: "Department-owned documents are listed with their department; keep institute-wide for institutional PDFs." }, { key: "description", label: "Description (optional)", type: "textarea", full: true }, { key: "altText", label: "Accessible title (optional)", type: "textarea", full: true },
  ] },
};

export { isEntityName } from "@/lib/content-policy";

/**
 * A record as returned by the admin content API. Values are rendered as text,
 * so the type stays descriptive instead of falling back to `any`.
 */
export type EntityRecord = Record<string, unknown> & { id?: string; status?: string };
type FieldValue = unknown;
const asText = (value: FieldValue) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));

/** Plain-language status names for the workspace (the API keeps the codes). */
export const statusLabels: Record<string, string> = { DRAFT: "Draft", REVIEW: "In review", PUBLISHED: "Published", ARCHIVED: "Archived" };
export const statusDescriptions: Record<string, string> = {
  DRAFT: "Not on the public website.",
  REVIEW: "Waiting to be checked and published. Not on the public website.",
  PUBLISHED: "Live on the public website.",
  ARCHIVED: "Taken off the public website and kept for reference.",
};

/** Message shown after a save, by the status the record now has. */
export function savedMessage(status: string, isExisting: boolean, previousStatus?: string) {
  if (status === "PUBLISHED") return previousStatus === "PUBLISHED" ? "Changes saved. They are live on the public website." : "Published. The record is now on the public website.";
  if (status === "REVIEW") return "Submitted for review. It is not public until it is published.";
  if (status === "ARCHIVED") return "Archived. The record is no longer on the public website.";
  if (previousStatus === "PUBLISHED") return "Unpublished. The record is no longer on the public website and is kept as a draft.";
  if (previousStatus === "ARCHIVED") return "Restored as a draft.";
  return isExisting ? "Draft saved." : "Draft created. It is not on the public website yet.";
}

function formatBytes(value: FieldValue) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File name of an upload, without the internal storage path. */
function fileName(record: EntityRecord) {
  const key = asText(record.key);
  return key ? key.split("/").pop() || "" : "";
}

export function EntityManager({ entity, capability }: { entity: EntityName; capability: EntityCapabilityDetail }) {
  const config = configs[entity];
  const [records, setRecords] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EntityRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const load = (targetPage = page) => { setLoading(true); fetch(`/api/admin/content?entity=${entity}&page=${targetPage}&limit=100`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not load content"); setRecords(body.records || []); setTotal(body.total || 0); setTotalPages(body.totalPages || 1); setPage(body.page || 1); }).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(1); }, [entity]);

  // Departments are loaded by name for the department pickers. A department
  // administrator never sees this list: their department is fixed by their
  // account, so another department's names are not fetched at all.
  useEffect(() => {
    if (capability.fixedDepartmentSlug || !config.fields.some((field) => field.type === "department")) return;
    fetch("/api/admin/content?entity=departments&page=1&limit=100")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load departments");
        // The visible label is the department name; the submitted value is its slug.
        setDepartments((body.records || []).map((record: { slug: string; name: string; status?: string }) => ({ id: record.slug, name: record.name, status: record.status })));
      })
      .catch((err) => setError(err.message));
  }, [entity, capability.fixedDepartmentSlug]);

  const startNew = () => {
    const blank: EntityRecord = {};
    config.fields.forEach((field) => {
      // A select always renders its first option, so the form state must start
      // there too. Leaving it empty made the browser show "TEXT" while the
      // payload carried "" and the API refused the notice.
      blank[field.key] = field.key === "departmentSlug" && capability.fixedDepartmentSlug ? capability.fixedDepartmentSlug
        : field.type === "select" ? field.options?.[0] || ""
        : "";
    });
    if (entity === "notices") blank.noticeDate = new Date().toISOString().slice(0, 10);
    setEditing(blank); setMessage(""); setError("");
  };

  const save = async (values: EntityRecord, action: WorkflowAction) => {
    setSaving(true); setError("");
    const isExisting = Boolean(values.id);
    const previousStatus = isExisting ? asText(values.status) : undefined;
    // Mirrors the server's workflow and notice validation so the editor
    // explains a mistake instead of failing on submit; the API stays the
    // authority and re-validates everything.
    const titleValue = asText(values[config.titleField]).trim();
    const required = config.fields.find((field) => field.required && !asText(values[field.key]).trim());
    if (required) { setSaving(false); setError(`Please fill in “${required.label}”.`); return; }
    if (entity === "notices") {
      const noticeType = asText(values.noticeType) || "TEXT";
      if (noticeType === "PDF" && !asText(values.documentId)) { setSaving(false); setError("A PDF notice needs a PDF file. Upload one in the “Notice PDF” field first."); return; }
      if (noticeType === "TEXT" && !asText(values.body).trim()) { setSaving(false); setError("A text notice needs the notice text."); return; }
    }
    // Only the fields this editor manages are sent: internal values that came
    // back with the record (timestamps, file details, relation objects) are
    // never round-tripped.
    const payload: Record<string, unknown> = { status: action.status };
    for (const field of config.fields) if (values[field.key] !== undefined) payload[field.key] = values[field.key];
    if (entity === "departments" && values.socialLinks !== undefined) payload.socialLinks = values.socialLinks;
    if (config.fields.some((field) => field.key === "slug") && !asText(values.slug).trim() && titleValue) payload.slug = slugify(titleValue);
    try {
      const response = await fetch("/api/admin/content", { method: isExisting ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id: values.id, data: payload }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save. Please try again.");
      setEditing(null); setMessage(savedMessage(action.status, isExisting, previousStatus)); load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Please try again."); }
    finally { setSaving(false); }
  };

  const titleFor = (record: EntityRecord) => asText(record[config.titleField]) || asText(record.name) || asText(record.title) || asText(record.label) || fileName(record) || "(untitled)";
  const remove = async (record: EntityRecord) => {
    const live = record.status === "PUBLISHED" ? " It is currently on the public website and will disappear immediately." : "";
    if (!window.confirm(`Delete “${titleFor(record)}” permanently?${live} This cannot be undone. The deletion is recorded in the audit log.`)) return;
    const response = await fetch(`/api/admin/content?entity=${entity}&id=${encodeURIComponent(String(record.id))}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "Could not delete the record."); return; }
    setMessage(`“${titleFor(record)}” was deleted.`); load();
  };
  const preview = (record: EntityRecord) => asText(record.overview) || asText(record.summary) || asText(record.description) || asText(record.body) || asText(record.value) || asText(record.caption) || "";
  // Second line under the record name: something a person recognises, never
  // an internal identifier.
  const subtitle = (record: EntityRecord) => {
    const parts = [
      asText(record.departmentName),
      asText(record.designation),
      asText(record.category),
      asText(record.level),
      entity === "notices" ? (asText(record.noticeType) === "PDF" ? "PDF notice" : "Text notice") : "",
      entity === "notices" && record.noticeDate ? new Date(asText(record.noticeDate)).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "",
      entity === "documents" || entity === "media" ? [fileName(record), formatBytes(record.sizeBytes)].filter(Boolean).join(" · ") : "",
      entity === "links" ? asText(record.url) : "",
      entity === "publications" && record.year ? asText(record.year) : "",
    ].filter(Boolean);
    return parts.slice(0, 2).join(" · ");
  };

  return <>
    <div className="entity-toolbar">
      <div><div className="admin-breadcrumb">Content / {config.title}</div><h2>{config.title}</h2><p className="small">{config.description}</p></div>
      {capability.canCreate && entity !== "media" && entity !== "documents" && <button className="button small-button" onClick={startNew}><Plus size={15} /> New {config.singular}</button>}
    </div>
    {(entity === "media" || entity === "documents") && capability.canCreate && <UploadPanel entity={entity} canPublish={capability.canPublish} onDone={(published) => { setMessage(published ? "Uploaded and published. The file is available on the public website." : entity === "documents" ? "Uploaded as a draft. Publish it here, or attach it to a notice — publishing the notice publishes the PDF too." : "Image uploaded."); load(); }} fixedDepartmentSlug={capability.fixedDepartmentSlug} departments={departments} />}
    {!capability.canCreate && <div className="admin-panel" style={{ marginBottom: 15, background: "var(--paper-2)" }}><p className="small">You can view this section, but your account cannot add records here. Contact an institute administrator if you need to.</p></div>}
    {error && <div className="alert" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}
    {loading ? <div className="admin-panel"><p className="small">Loading…</p></div> : <>
      <div className="admin-panel" style={{ padding: 0, overflowX: "auto" }}><table className="entity-table"><thead><tr><th>Record</th><th>Summary</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>
        {records.map((record) => <tr key={String(record.id)}>
          <td><strong>{titleFor(record)}</strong>{subtitle(record) && <><br /><span className="small">{subtitle(record)}</span></>}</td>
          <td><span className="small">{preview(record).slice(0, 150)}{preview(record).length > 150 ? "…" : ""}</span></td>
          <td>{record.status ? <span className={`status-pill ${String(record.status).toLowerCase()}`} title={statusDescriptions[String(record.status)]}>{statusLabels[String(record.status)] || String(record.status)}</span> : <span className="tag">setting</span>}</td>
          <td><span className="small">{record.updatedAt ? new Date(asText(record.updatedAt)).toLocaleDateString("en-IN") : "—"}</span></td>
          <td><div className="entity-actions"><button className="mini-button" onClick={() => { setError(""); setMessage(""); setEditing(normalizeForForm(record, config.fields)); }}>Edit</button>{capability.canDelete && <button className="mini-button danger" aria-label={`Delete ${titleFor(record)}`} onClick={() => remove(record)}><Trash2 size={13} /> Delete</button>}</div></td>
        </tr>)}
        {records.length === 0 && <tr><td colSpan={5}><div className="admin-empty-state"><strong>No {config.title.toLowerCase()} yet</strong>{capability.canCreate ? (entity === "media" || entity === "documents" ? "Use the upload form above to add the first file." : `Use “New ${config.singular}” to add the first one.`) : "Nothing has been added here so far."}</div></td></tr>}
      </tbody></table></div>
      <div className="cta-row" style={{ marginTop: 10, justifyContent: "space-between" }}><span className="small">{total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}</span><div style={{ display: "flex", gap: 8 }}><button className="button small-button secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button className="button small-button secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button></div></div>
    </>}
    {editing && <EditorModal entity={entity} config={config} capability={capability} departments={departments} value={editing} saving={saving} error={error} onClose={() => { setEditing(null); setError(""); }} onSave={save} />}
  </>;
}

function UploadPanel({ entity, canPublish, onDone, fixedDepartmentSlug, departments }: { entity: "media" | "documents"; canPublish: boolean; onDone: (published: boolean) => void; fixedDepartmentSlug?: string; departments: DepartmentOption[] }) {
  const [file, setFile] = useState<File | null>(null); const [title, setTitle] = useState(""); const [altText, setAltText] = useState(""); const [caption, setCaption] = useState(""); const [publish, setPublish] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [departmentSlug, setDepartmentSlug] = useState(fixedDepartmentSlug || "");
  const isDocument = entity === "documents";
  const upload = async () => {
    if (!file) { setError(isDocument ? "Choose a PDF file first." : "Choose an image file first."); return; }
    if (!isDocument && !altText.trim()) { setError("Describe the image for screen-reader users before uploading."); return; }
    if (publish && !window.confirm(isDocument ? "Publish this PDF on the public website as soon as it is uploaded?" : "Publish this image as soon as it is uploaded?")) return;
    setBusy(true); setError("");
    const form = new FormData(); form.append("file", file); form.append("collection", entity); form.append("title", title || file.name); form.append("altText", altText); form.append("caption", caption); form.append("status", isDocument && publish && canPublish ? "PUBLISHED" : "DRAFT"); if (isDocument && departmentSlug) form.append("departmentSlug", departmentSlug);
    const response = await fetch("/api/admin/media/upload", { method: "POST", body: form }); const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(body.error || "The upload did not work. Please try again."); return; }
    setFile(null); setTitle(""); setAltText(""); setCaption(""); setPublish(false); onDone(isDocument && publish && canPublish);
  };
  return <div className="admin-panel" style={{ marginBottom: 15, background: "var(--paper-2)" }}><div className="admin-panel-head"><h3>{isDocument ? "Upload a PDF" : "Upload an image"}</h3><span className="small">{isDocument ? "PDF files up to 25 MB." : "PNG, JPEG, WebP or GIF up to 10 MB."}</span></div><div className="form-grid"><div className="form-field"><label htmlFor="upload-file">{isDocument ? "PDF file" : "Image file"}</label><input id="upload-file" className="form-control" type="file" accept={entity === "media" ? "image/png,image/jpeg,image/webp,image/gif" : "application/pdf"} onChange={(event) => setFile(event.target.files?.[0] || null)} /></div><div className="form-field"><label htmlFor="upload-title">{isDocument ? "Document title" : "Title (optional)"}</label><input id="upload-title" className="form-control" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={file?.name || ""} /></div><div className="form-field"><label htmlFor="upload-alt">{isDocument ? "Accessible title (optional)" : "Description for screen readers"}</label><input id="upload-alt" className="form-control" value={altText} maxLength={300} onChange={(event) => setAltText(event.target.value)} /></div><div className="form-field"><label htmlFor="upload-caption">{isDocument ? "Description (optional)" : "Caption (optional)"}</label><input id="upload-caption" className="form-control" value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} /></div></div>{isDocument && (fixedDepartmentSlug
    ? <p className="form-hint">The PDF is stored for your department ({departments.find((option) => option.id === fixedDepartmentSlug)?.name || "your assigned department"}).</p>
    : <DepartmentSelect id="upload-department" label="Department" value={departmentSlug} onChange={setDepartmentSlug} options={departments} noneLabel="Institute-wide (no department)" hint="Choose the department that owns this PDF, or keep it institute-wide." />)}
    {isDocument && (canPublish
      ? <label className="form-check"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> Publish this PDF on the public website immediately</label>
      : <p className="form-hint">Uploaded PDFs are saved as drafts. A PDF attached to a notice is published together with the notice; other PDFs are published by an institute administrator.</p>)}
    {error && <div className="alert" role="alert">{error}</div>}<button className="button small-button" style={{ marginTop: 14 }} onClick={upload} disabled={busy}>{busy ? "Uploading…" : isDocument ? "Upload PDF" : "Upload image"}</button></div>;
}

function normalizeForForm(record: EntityRecord, fields: { key: string; type?: string }[]): EntityRecord {
  const clone: EntityRecord = { ...record };
  fields.forEach((field) => {
    if (["researchInterests", "researchAreaSlugs", "laboratorySlugs", "facultySlugs", "departmentSlugs", "authorSlugs"].includes(field.key) && Array.isArray(clone[field.key])) clone[field.key] = (clone[field.key] as unknown[]).join(", ");
    // <input type="date"> only accepts YYYY-MM-DD; stored values are timestamps.
    if (field.type === "date" && clone[field.key]) clone[field.key] = asText(clone[field.key]).slice(0, 10);
  });
  if (Array.isArray(clone.socialLinks)) clone.socialLinks = (clone.socialLinks as Record<string, unknown>[]).map((link) => ({ platform: asText(link.platform), url: asText(link.url), label: asText(link.label), order: link.order }));
  return clone;
}

function EditorModal({ entity, config, capability, departments, value, saving, error, onClose, onSave }: {
  entity: EntityName;
  config: EntityConfig;
  capability: EntityCapabilityDetail;
  departments: DepartmentOption[];
  value: EntityRecord;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (value: EntityRecord, action: WorkflowAction) => void;
}) {
  const [form, setForm] = useState(value);
  const [uploads, setUploads] = useState<Record<string, boolean>>({});
  const dialog = useRef<HTMLDivElement>(null);
  const uploading = Object.values(uploads).some(Boolean);
  const set = (key: string, next: FieldValue) => setForm((current) => ({ ...current, [key]: next }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const currentStatus = form.id ? asText(form.status) || "DRAFT" : undefined;
  // Site settings and images carry no workflow: they are simply saved.
  const hasWorkflow = entity !== "settings" && entity !== "media";
  const actions: WorkflowAction[] = hasWorkflow ? workflowActions(capability, currentStatus) : [{ status: "PUBLISHED", label: "Save", kind: "primary" }];
  const fixedDepartment = capability.fixedDepartmentSlug ? departments.find((option) => option.id === capability.fixedDepartmentSlug) : undefined;
  const visibleFields = config.fields.filter((field) => !(entity === "notices" && field.key === "documentId" && (asText(form.noticeType) || "TEXT") !== "PDF") && !(entity === "notices" && field.key === "body" && asText(form.noticeType) === "PDF" && !asText(form.body)));
  const run = (action: WorkflowAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    onSave(form, action);
  };
  return <div ref={dialog} tabIndex={-1} className="accessibility-panel admin-editor" role="dialog" aria-modal="true" aria-label={`${form.id ? "Edit" : "New"} ${config.singular}`} onKeyDown={(event) => {
    if (event.key === "Escape" && !uploading && !saving) onClose();
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <button className="panel-close" aria-label="Close editor" disabled={uploading || saving} onClick={onClose}><X size={17} /></button>
    <div className="eyebrow">{form.id ? `Edit ${config.singular}` : `New ${config.singular}`}</div><h2>{config.title}</h2>
    {hasWorkflow && <p className="editor-status">{currentStatus
      ? <><span className={`status-pill ${currentStatus.toLowerCase()}`}>{statusLabels[currentStatus] || currentStatus}</span> <span className="small">{statusDescriptions[currentStatus]}</span></>
      : <span className="small">New records are not on the public website until they are published.</span>}</p>}
    {error && <div className="alert" role="alert">{error}</div>}
    {(entity === "documents" || entity === "media") && form.id && <p className="form-hint file-summary"><strong>File:</strong> {fileName(form) || "uploaded file"}{formatBytes(form.sizeBytes) ? ` · ${formatBytes(form.sizeBytes)}` : ""}{entity === "documents" && form.status === "PUBLISHED" && asText(form.url) && <> · <a href={asText(form.url)} target="_blank" rel="noopener noreferrer">Open PDF</a></>}</p>}
    <div className="form-grid">{visibleFields.map((field) => <div className={`form-field ${field.full ? "full" : ""}`} key={field.key}>
      {!(field.type === "department" && !capability.fixedDepartmentSlug) && <label htmlFor={`field-${field.key}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>}
      {field.type === "asset" ? <AssetPicker fieldKey={field.key} value={asText(form[field.key])} departmentSlug={asText(form.departmentSlug)} onChange={(next) => set(field.key, next)} onBusyChange={(busy) => setUploads((current) => ({ ...current, [field.key]: busy }))} />
        : field.type === "textarea" ? <textarea id={`field-${field.key}`} className="form-textarea" value={asText(form[field.key])} onChange={(event) => set(field.key, event.target.value)} />
        : field.type === "select" ? <select id={`field-${field.key}`} className="form-select" value={asText(form[field.key]) || field.options?.[0] || ""} onChange={(event) => set(field.key, event.target.value)}>{field.options?.map((option) => <option key={option} value={option}>{field.optionLabels?.[option] || option}</option>)}</select>
        : field.type === "department" ? (capability.fixedDepartmentSlug
          ? <input id={`field-${field.key}`} className="form-control" value={fixedDepartment?.name || "Your department"} readOnly aria-describedby={`field-${field.key}-hint`} />
          : <><DepartmentSelect
              id={`field-${field.key}`}
              label={field.label}
              value={asText(form[field.key])}
              onChange={(next) => set(field.key, next)}
              options={departments}
              noneLabel={field.key === "departmentSlug" && entity === "notices" ? "Institute-wide (no department)" : "No department"}
            /></>)
        : <input id={`field-${field.key}`} className="form-control" type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.key === "cvUrl" ? "url" : "text"} value={asText(form[field.key])} onChange={(event) => set(field.key, event.target.value)} />}
      {field.hint && <div className="form-hint">{field.hint}</div>}
      {field.type === "department" && capability.fixedDepartmentSlug && <div className="form-hint" id={`field-${field.key}-hint`}>Your account belongs to this department, so {entity === "notices" ? "the notice" : "the record"} is filed under it automatically.</div>}
    </div>)}</div>
    {entity === "departments" && <SocialLinksEditor value={form.socialLinks} onChange={(links) => set("socialLinks", links)} />}
    {actions.length === 0 && <div className="alert" role="note">{currentStatus === "ARCHIVED" ? "This record is archived. An institute administrator can restore it as a draft." : currentStatus === "PUBLISHED" ? "This record is on the public website and your account cannot publish changes to it. Ask an institute administrator." : "Your account cannot change this record."}</div>}
    {actions.some((action) => action.description) && <ul className="form-hint editor-action-notes">{actions.filter((action) => action.description).map((action) => <li key={action.status}><strong>{action.label}:</strong> {action.description}</li>)}</ul>}
    <div className="form-actions">
      <button className="button secondary small-button" disabled={uploading || saving} onClick={onClose}>Cancel</button>
      {actions.map((action) => <button key={`${action.status}-${action.label}`} className={`button small-button${action.kind === "secondary" ? " secondary" : ""}`} disabled={saving || uploading} onClick={() => run(action)}>{action.kind === "primary" && <Save size={14} />} {saving ? "Saving…" : uploading ? "Uploading…" : action.label}</button>)}
    </div>
  </div>;
}

const socialPlatformOptions = [["INSTAGRAM", "Instagram"], ["FACEBOOK", "Facebook"], ["LINKEDIN", "LinkedIn"], ["X", "X (Twitter)"], ["YOUTUBE", "YouTube"], ["WEBSITE", "Official website"], ["OTHER", "Other official link"]] as const;

/**
 * Department-owned official channels, edited as part of the department record.
 * Values are structured (platform + URL + optional label); no HTML is stored
 * and the server validates every URL before saving.
 */
function SocialLinksEditor({ value, onChange }: { value: FieldValue; onChange: (links: Record<string, unknown>[]) => void }) {
  const links: Record<string, unknown>[] = Array.isArray(value) ? value as Record<string, unknown>[] : [];
  const update = (index: number, patch: Record<string, string>) => onChange(links.map((link, position) => (position === index ? { ...link, ...patch } : link)));
  const add = () => onChange([...links, { platform: "INSTAGRAM", url: "", label: "", order: links.length }]);
  const remove = (index: number) => onChange(links.filter((_, position) => position !== index).map((link, position) => ({ ...link, order: position })));
  return <div className="form-field full">
    <span className="form-label">Official social &amp; external links</span>
    <div className="form-hint">Only add accounts owned by this department. Links appear in a public “Official channels” section when the department is published.</div>
    {links.map((link, index) => <div className="social-link-row" key={index}>
      <select className="form-select" aria-label={`Platform for link ${index + 1}`} value={asText(link.platform) || "INSTAGRAM"} onChange={(event) => update(index, { platform: event.target.value })}>
        {socialPlatformOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input className="form-control" aria-label={`URL for link ${index + 1}`} placeholder="https://…" value={asText(link.url)} onChange={(event) => update(index, { url: event.target.value })} />
      {link.platform === "OTHER" && <input className="form-control" aria-label={`Label for link ${index + 1}`} placeholder="Channel name" value={asText(link.label)} onChange={(event) => update(index, { label: event.target.value })} />}
      <button type="button" className="mini-button danger" onClick={() => remove(index)}><Trash2 size={13} /> Remove</button>
    </div>)}
    <button type="button" className="button secondary small-button" style={{ marginTop: links.length ? 10 : 0 }} onClick={add}><Plus size={14} /> Add official link</button>
  </div>;
}

function AssetPicker({ fieldKey, value, departmentSlug, onChange, onBusyChange }: { fieldKey: string; value: string; departmentSlug?: string; onChange: (id: string) => void; onBusyChange: (busy: boolean) => void }) {
  const collection = fieldKey === "profileImageId" ? "media" : fieldKey === "cvDocumentId" || fieldKey === "documentId" ? "documents" : "organizations";
  const [records, setRecords] = useState<EntityRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [altText, setAltText] = useState("");
  const load = async () => {
    try {
      const rows: EntityRecord[] = [];
      let page = 1, totalPages = 1;
      do {
        const response = await fetch(`/api/admin/content?entity=${collection}&page=${page}&limit=100`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load the list.");
        rows.push(...body.records); totalPages = body.totalPages; page++;
      } while (page <= totalPages);
      setRecords(rows);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load the list."); }
  };
  useEffect(() => { void load(); }, [collection]);
  const upload = async (file?: File) => {
    if (!file || collection === "organizations") return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const alt = collection === "media" ? altText.trim() : file.name;
      if (!alt) { setError("Describe the photograph for screen-reader users before uploading it."); return; }
      const form = new FormData(); form.append("file", file); form.append("collection", collection); form.append("altText", alt); form.append("title", file.name); form.append("status", "DRAFT");
      if (departmentSlug) form.append("departmentSlug", departmentSlug);
      const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The upload did not work. Please try again.");
      await load(); onChange(body.record.id);
    } catch (error) { setError(error instanceof Error ? error.message : "The upload did not work. Please try again."); }
    finally { setBusy(false); onBusyChange(false); }
  };
  const optionLabel = (row: EntityRecord) => {
    const name = asText(row.title) || asText(row.name) || asText(row.altText) || fileName(row) || "Untitled";
    return row.status && collection !== "organizations" ? `${name} (${(statusLabels[String(row.status)] || String(row.status)).toLowerCase()})` : name;
  };
  const chooseLabel = collection === "media" ? "Choose a photograph that was uploaded earlier" : collection === "documents" ? "Choose a PDF that was uploaded earlier" : "Choose a student organization";
  return <div>
    <select id={`field-${fieldKey}`} className="form-select" aria-label={chooseLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{collection === "organizations" ? "None" : "None selected"}</option>
      {value && !records.some((row) => row.id === value) && <option value={value}>Current selection (not available in this list)</option>}
      {records.map((row) => <option key={String(row.id)} value={String(row.id)}>{optionLabel(row)}</option>)}
    </select>
    {collection === "media" && <><label className="form-hint" htmlFor="photo-alt">Description of a new photograph (for screen readers)</label><input id="photo-alt" className="form-control" value={altText} maxLength={300} placeholder="Portrait of Dr. …" onChange={(event) => setAltText(event.target.value)} /></>}
    {collection !== "organizations" && <><label className="form-hint" htmlFor={`upload-${fieldKey}`}>{collection === "media" ? "Or upload a new photograph" : "Or upload a new PDF"}</label><input id={`upload-${fieldKey}`} type="file" disabled={busy} accept={collection === "media" ? "image/png,image/jpeg,image/webp,image/gif" : "application/pdf"} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></>}
    {collection === "documents" && fieldKey === "documentId" && <p className="form-hint">A newly uploaded PDF is kept private until this notice is published. Publishing the notice makes the PDF public as well.</p>}
    {collection === "documents" && fieldKey === "cvDocumentId" && <p className="form-hint">A newly uploaded CV is kept private until it is published in Documents.</p>}
    {busy && <p role="status">Uploading…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}

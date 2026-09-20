"use client";

import Link from "next/link";
import { Archive, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function AuditLog() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const load = (targetPage = page) => {
    fetch(`/api/admin/audit?page=${targetPage}&limit=100`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Sign in required");
      setLogs(body.logs || []);
      setTotal(body.total || 0);
      setTotalPages(body.totalPages || 1);
      setPage(body.page || 1);
    }).catch((err) => setError(err.message));
  };
  useEffect(() => { load(1); }, []);
  return <><div className="entity-toolbar"><div><div className="admin-breadcrumb">Governance / Audit log</div><h2>Audit logs</h2><p className="small">Important admin actions are logged with actor, entity, timestamp and state snapshots where practical.</p></div><Link href="/admin" className="button secondary small-button">Dashboard</Link></div>{error && <div className="alert">{error}. <Link href="/admin/login">Sign in.</Link></div>}<div className="admin-panel"><div className="admin-panel-head"><h3><Archive size={17} /> Actions</h3><span className="tag"><ShieldCheck size={13} /> Governance</span></div>{logs === null ? <p className="small">Loading audit log…</p> : logs.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Actor</th><th>Action</th><th>Entity</th><th>Timestamp</th><th>Snapshot</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{log.user || log.userId || "system"}</td><td><span className="status-pill review">{log.action}</span></td><td>{log.entity}{log.entityId ? <><br /><span className="small">{log.entityId}</span></> : null}</td><td>{new Date(log.timestamp || log.createdAt).toLocaleString("en-IN")}</td><td><span className="small">{log.after ? "after state captured" : log.afterJson ? "after state captured" : "event recorded"}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No audit entries</strong><span>Actions created in the CMS will appear here.</span></div>}</div><div className="cta-row" style={{ marginTop: 12, justifyContent: "space-between" }}><span className="small">{total} entries · page {page} of {totalPages}</span><div style={{ display: "flex", gap: 8 }}><button className="button small-button secondary" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button className="button small-button secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button></div></div></>;
}

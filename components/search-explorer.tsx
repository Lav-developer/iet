"use client";

import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";

type SearchRecord = { id: string; type: string; title: string; description: string; href: string; meta?: string };

export function SearchExplorer({ records }: { records: SearchRecord[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => { const normalized = query.trim().toLowerCase(); if (!normalized) return []; return records.filter((record) => `${record.title} ${record.description} ${record.meta || ""} ${record.type}`.toLowerCase().includes(normalized)); }, [query, records]);
  return <><form className="search-form" onSubmit={(event) => event.preventDefault()}><input aria-label="Search IET content" autoFocus placeholder="Try AI, laboratory, CSE, faculty…" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="button" type="submit"><SearchIcon size={18} /> Search</button></form><div style={{ marginTop: 30 }}>{query ? <>{results.length ? <><div className="small" style={{ marginBottom: 14 }}>{results.length} matching records</div><div className="search-results">{results.map((result) => <Link href={result.href} className="search-result" key={`${result.type}-${result.id}`}><span className="result-type">{result.type}</span><h3>{result.title}</h3><p>{result.description}</p>{result.meta && <span className="small">{result.meta}</span>}</Link>)}</div></> : <EmptyState title="No matching approved records" description="Try a broader term or ask an IET administrator to add the missing source record." />}</> : <div className="empty-state"><strong>Search the institutional knowledge base</strong><span>Results can include pages, departments, programmes, faculty, laboratories, research areas, projects, publications, events, achievements and documents.</span></div>}</div></>;
}

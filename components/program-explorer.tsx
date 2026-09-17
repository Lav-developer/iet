"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import type { Program } from "@/lib/types";

export function ProgramExplorer({ programs }: { programs: Program[] }) {
  const [query, setQuery] = useState(""); const [level, setLevel] = useState("ALL");
  const filtered = useMemo(() => programs.filter((program) => (level === "ALL" || program.level === level) && `${program.title} ${program.departmentName}`.toLowerCase().includes(query.toLowerCase())), [programs, query, level]);
  return <><div className="filter-bar"><Search size={17} color="var(--muted)" /><input aria-label="Search programmes" placeholder="Search by programme or department" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter by level" value={level} onChange={(event) => setLevel(event.target.value)}><option value="ALL">All levels</option><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select><span className="small">{filtered.length} records</span></div>{filtered.length ? <div className="data-grid">{filtered.map((program) => <Link href={`/programs/${program.slug}`} className="data-card" key={program.id}><div className="card-meta"><span className="tag">{program.level}</span><span className="tag">{program.duration}</span>{program.approvedSeats && <span className="tag">{program.approvedSeats} seats</span>}</div><h3>{program.title}</h3><p>{program.departmentName}</p><p>{program.summary}</p><span className="link-arrow">Open programme</span></Link>)}</div> : <EmptyState title="No matching programme records" />}</>;
}

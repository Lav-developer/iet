"use client";

import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import type { Laboratory } from "@/lib/types";

export function LaboratoryDirectory({ laboratories, departments }: { laboratories: Laboratory[]; departments: { slug: string; name: string }[] }) {
  const [query, setQuery] = useState(""); const [department, setDepartment] = useState("ALL");
  const filtered = useMemo(() => laboratories.filter((lab) => department === "ALL" || lab.departmentSlug === department).filter((lab) => `${lab.name} ${lab.description} ${lab.departmentName}`.toLowerCase().includes(query.toLowerCase())), [laboratories, departments, query, department]);
  return <><div className="filter-bar"><Search size={17} color="var(--muted)" /><input aria-label="Search laboratories" placeholder="Search laboratories and facility records" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter laboratories by department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="ALL">All departments</option>{departments.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select><span className="small">{filtered.length} records</span></div>{filtered.length ? <div className="data-grid">{filtered.map((lab) => <Link href={`/laboratories/${lab.slug}`} className="data-card" key={lab.id}><FlaskConical size={24} color="var(--copper)" /><h3>{lab.name}</h3><p>{lab.departmentName}</p><p>{lab.description}</p><span className="link-arrow">Open facility record</span></Link>)}</div> : <EmptyState title="No matching laboratory records" />}</>;
}

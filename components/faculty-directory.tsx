"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, EmptyState } from "@/components/ui";
import type { FacultyMember } from "@/lib/types";

export function FacultyDirectory({ faculty, departments, initialKind = "FACULTY" }: { initialKind?: string; faculty: FacultyMember[]; departments: { slug: string; name: string }[] }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [kind, setKind] = useState(initialKind);
  const filtered = useMemo(() => faculty.filter((item) => {
    const haystack = `${item.name} ${item.designation} ${item.qualification || ""} ${(item.researchInterests || []).join(" ")}`.toLowerCase();
    return (kind === "ALL" || (kind === "FACULTY" ? item.type === "FACULTY" || item.type === "LEADERSHIP" : item.type !== "FACULTY" && item.type !== "LEADERSHIP")) && (department === "ALL" || item.departmentSlug === department) && haystack.includes(query.toLowerCase());
  }), [faculty, query, department, kind]);
  return <>
    <div className="filter-bar"><Search size={17} color="var(--muted)" /><input aria-label="Search faculty" placeholder="Search name, designation, qualification or research area" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter by department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="ALL">All departments</option>{departments.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select><select aria-label="Filter by person type" value={kind} onChange={(event) => setKind(event.target.value)}><option value="FACULTY">Faculty & leadership</option><option value="STAFF">Laboratory / staff</option><option value="ALL">Everyone</option></select><span className="small">{filtered.length} profiles</span></div>
    {filtered.length ? <div className="profile-grid">{filtered.map((person) => <Link className="profile-card" href={`/faculty/${person.slug}`} key={person.id}><Avatar name={person.name} image={person.profileImage} /><h3>{person.name}</h3><div className="designation">{person.designation}</div><div className="profile-spacer" />{person.departmentName && <span className="small">{person.departmentName}</span>}{person.researchInterests?.length ? <span className="contact-line">Research: {person.researchInterests.slice(0, 2).join(" · ")}</span> : null}<span className="link-arrow" style={{ marginTop: 10 }}>Open profile</span></Link>)}</div> : <EmptyState title="No matching profiles" description="Try a different name or select all departments." />}
  </>;
}

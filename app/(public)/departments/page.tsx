import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Departments", description: "Explore the academic departments of IET-DSMNRU." };
export default async function DepartmentsPage() {
 const data = await getSiteData();
 return <><PageHeader eyebrow="Academic structure" title="Departments" description="Explore our programmes, faculty, laboratories and research by department." breadcrumbs={[{ label: "Departments" }]} />
 <section className="section"><div className="container">{data.departments.length ? <div className="dept-grid">{data.departments.map((department, index) => <Link href={`/departments/${department.slug}`} className="dept-card" key={department.id}><span className="dept-code">{String(index + 1).padStart(2, "0")} / {department.shortName || "IET"}</span><h2>{department.name}</h2><p>{department.overview}</p><span className="link-arrow">Explore department</span></Link>)}</div> : <EmptyState title="No departments to display" />}</div></section></>;
}

import Link from "next/link";
import { Building2, FlaskConical } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Infrastructure", description: "Explore laboratories, workshops and teaching facilities at IET-DSMNRU." };

export default async function InfrastructurePage() { const data = await getSiteData(); return <><PageHeader eyebrow="About IET" title="Infrastructure" description="Explore laboratories, workshops and teaching facilities across our departments." breadcrumbs={[{ label: "Infrastructure" }]} /><section className="section"><div className="container"><SectionHeading eyebrow="Facilities" title="Laboratories & workshops" href="/laboratories" linkLabel="All laboratories" /><div className="data-grid">{data.laboratories.map((lab) => <Link href={`/laboratories/${lab.slug}`} className="data-card" key={lab.id}><FlaskConical size={24} color="var(--copper)" /><h3>{lab.name}</h3><p>{lab.departmentName}</p><span className="link-arrow">Explore laboratory</span></Link>)}</div><div style={{ marginTop: 28 }}></div></div></section><section className="section soft"><div className="container content-grid"><div><Building2 size={27} color="var(--copper)" /><h2 style={{ marginTop: 15 }}>Campus context</h2><p className="lead">Laboratories, workshops and smart classrooms support teaching and learning at IET.</p></div></div></section></>; }

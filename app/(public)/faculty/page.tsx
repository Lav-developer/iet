import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { FacultyDirectory } from "@/components/faculty-directory";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Faculty & staff", description: "Find faculty and staff by name, department, designation and research interests." };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
 const data = await getSiteData(); const { kind } = await searchParams;
 return <><PageHeader eyebrow="IET / DSMNRU" title="Faculty & staff" description="Find faculty and staff by name, department, designation and research interests." breadcrumbs={[{ label: "Faculty & staff" }]} />
 <section className="section"><div className="container"><FacultyDirectory faculty={data.faculty} departments={data.departments} initialKind={kind === "staff" ? "STAFF" : "FACULTY"} /></div></section>
 </>;
}

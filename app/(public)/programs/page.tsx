import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ProgramExplorer } from "@/components/program-explorer";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Programmes", description: "Explore undergraduate and postgraduate programmes at IET." };
export default async function Page() {
 const data = await getSiteData();
 return <><PageHeader eyebrow="IET / DSMNRU" title="Programmes" description="Explore undergraduate and postgraduate programmes at IET." breadcrumbs={[{ label: "Programmes" }]} />
 <section className="section"><div className="container"><ProgramExplorer programs={data.programs} /></div></section>
 <section className="section soft"><div className="container"><h2>Ready to apply?</h2><p>Check the current university bulletin for eligibility, fees and application dates.</p><Link href="/admissions" className="button">Admissions information</Link></div></section></>;
}

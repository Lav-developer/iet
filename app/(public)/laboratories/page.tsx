import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { LaboratoryDirectory } from "@/components/laboratory-directory";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Laboratories", description: "Explore laboratories, workshops and facilities across IET departments." };
export default async function Page() {
 const data = await getSiteData();
 return <><PageHeader eyebrow="IET / DSMNRU" title="Laboratories" description="Explore laboratories, workshops and facilities across IET departments." breadcrumbs={[{ label: "Laboratories" }]} />
 <section className="section"><div className="container"><LaboratoryDirectory laboratories={data.laboratories} departments={data.departments} /></div></section>
 </>;
}

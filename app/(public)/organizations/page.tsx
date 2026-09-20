import { OrganizationCard } from "@/components/content-cards";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Student organizations", description: "Explore technical clubs, chapters and student groups at IET." };

export default async function Page() {
  const data = await getSiteData();
  return <><PageHeader eyebrow="Campus life" title="Student organizations" description="Explore technical clubs, chapters and student groups at IET." breadcrumbs={[{ label: "Student organizations" }]} />
    <section className="section"><div className="container">
      {data.organizations.length ? <div className="data-grid">{data.organizations.map((item) => <OrganizationCard key={item.id} organization={item} />)}</div> : <EmptyState title="No organizations to display yet" />}
    </div></section></>;
}

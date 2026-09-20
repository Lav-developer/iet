import { PublicationCard } from "@/components/content-cards";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Publications", description: "Research publications by IET faculty and researchers." };

export default async function Page() {
  const data = await getSiteData();
  return <><PageHeader eyebrow="Research & innovation" title="Publications" description="Research publications by IET faculty and researchers." breadcrumbs={[{ label: "Publications" }]} />
    <section className="section"><div className="container">
      {data.publications.length ? <div className="data-grid">{data.publications.map((item) => <PublicationCard key={item.id} publication={item} />)}</div> : <EmptyState title="No publications to display yet" />}
    </div></section></>;
}

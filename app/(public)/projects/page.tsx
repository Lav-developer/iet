import { ProjectCard } from "@/components/content-cards";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Research projects", description: "Explore research and innovation projects at IET." };

export default async function Page() {
  const data = await getSiteData();
  return <><PageHeader eyebrow="Research & innovation" title="Research projects" description="Explore research and innovation projects at IET." breadcrumbs={[{ label: "Research projects" }]} />
    <section className="section"><div className="container">
      {data.projects.length ? <div className="data-grid">{data.projects.map((item) => <ProjectCard key={item.id} project={item} />)}</div> : <EmptyState title="No projects to display yet" />}
    </div></section></>;
}

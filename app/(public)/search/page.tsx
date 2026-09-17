import { SearchExplorer } from "@/components/search-explorer";
import { PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Search", description: "Search across the IET-DSMNRU institutional information platform." };

export default async function SearchPage() { const data = await getSiteData(); const records = [
  ...data.pages.map((item) => ({ id: item.id, type: "Page", title: item.title, description: item.excerpt || item.body, href: `/${item.slug}` })),
  ...data.departments.map((item) => ({ id: item.id, type: "Department", title: item.name, description: item.overview, href: `/departments/${item.slug}`, meta: item.shortName })),
  ...data.programs.map((item) => ({ id: item.id, type: "Programme", title: item.title, description: item.summary, href: `/programs/${item.slug}`, meta: `${item.level} · ${item.departmentName || "IET"}` })),
  ...data.faculty.map((item) => ({ id: item.id, type: "Faculty", title: item.name, description: `${item.designation}. ${item.profile || ""}`, href: `/faculty/${item.slug}`, meta: item.departmentName })),
  ...data.laboratories.map((item) => ({ id: item.id, type: "Laboratory", title: item.name, description: item.description, href: `/laboratories/${item.slug}`, meta: item.departmentName })),
  ...data.researchAreas.map((item) => ({ id: item.id, type: "Research area", title: item.name, description: item.description, href: `/research#${item.slug}`, meta: item.sourceNote })),
  ...data.projects.map((item) => ({ id: item.id, type: "Project", title: item.title, description: item.summary, href: "/research", meta: item.departmentName })),
  ...data.publications.map((item) => ({ id: item.id, type: "Publication", title: item.title, description: item.abstract || "Approved publication record", href: "/research", meta: item.venue })),
  ...data.events.map((item) => ({ id: item.id, type: "Event", title: item.title, description: item.summary, href: "/events", meta: item.location })),
  ...data.achievements.map((item) => ({ id: item.id, type: "Achievement", title: item.title, description: item.description, href: "/achievements", meta: item.category })),
]; return <><PageHeader eyebrow="Global search" title="Search the IET knowledge base." description="One search surface across structured academic content and approved public pages. Results show their content type so visitors know what they found." breadcrumbs={[{ label: "Search" }]} /><section className="search-hero"><div className="container"><SearchExplorer records={records} /></div></section></>; }

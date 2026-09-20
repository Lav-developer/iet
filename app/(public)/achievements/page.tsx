import { EmptyState, PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Achievements", description: "Student, faculty and team achievements at IET-DSMNRU." };
export default async function AchievementsPage() {
  const data = await getSiteData();
  return <><PageHeader eyebrow="Campus life" title="Achievements" description="Celebrating student, faculty and team achievements." breadcrumbs={[{ label: "Achievements" }]} />
    <section className="section"><div className="container">{data.achievements.length ? <div className="data-grid">{data.achievements.map((item) => <article className="data-card" key={item.id}><span className="tag">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p>{item.recipient && <p>{item.recipient}</p>}{(item.year || item.eventName) && <p className="small">{[item.year, item.eventName].filter(Boolean).join(" · ")}</p>}</article>)}</div> : <EmptyState title="No achievements to display yet" />}</div></section></>;
}

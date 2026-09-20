import { EventCard } from "@/components/content-cards";
import { EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Events & activities", description: "Workshops, seminars and student activities at IET-DSMNRU." };
export default async function EventsPage() {
  const data = await getSiteData();
  const now = new Date();
  const upcoming = data.events.filter((event) => event.startsAt && new Date(event.endsAt || event.startsAt) >= now);
  const past = data.events.filter((event) => event.startsAt && !upcoming.includes(event));
  const undated = data.events.filter((event) => !event.startsAt);
  return <><PageHeader eyebrow="Campus life" title="Events & activities" description="Workshops, seminars, conferences and student activities at IET." breadcrumbs={[{ label: "Events" }]} />
    <section className="section"><div className="container">
      <SectionHeading eyebrow="Calendar" title="Upcoming & ongoing" />{upcoming.length ? <div className="data-grid">{upcoming.map((event) => <EventCard key={event.id} event={event} />)}</div> : <EmptyState title="No upcoming events to display" />}
      {past.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Archive" title="Past events" /><div className="data-grid">{past.map((event) => <EventCard key={event.id} event={event} />)}</div></section>}
      {undated.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Activities" title="More at IET" /><div className="data-grid">{undated.map((event) => <EventCard key={event.id} event={event} />)}</div></section>}
    </div></section><section className="section soft"><div className="container"><h2>University notices</h2><a className="link-arrow" href="https://dsmru.up.nic.in/main/User/Notices.aspx" target="_blank" rel="noopener noreferrer">Official DSMNRU notices</a></div></section></>;
}

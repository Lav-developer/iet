import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/content-cards";
import { PageHeader, SectionHeading } from "@/components/ui";
import { safeExternalUrl } from "@/lib/public-content";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await getSiteData();
  const organization = data.organizations.find((item) => item.slug === slug);
  return { title: organization?.name || "Organization not found", description: organization?.description };
}

export default async function OrganizationPage({ params }: Props) {
  const { slug } = await params;
  const data = await getSiteData();
  const organization = data.organizations.find((item) => item.slug === slug && item.status === "PUBLISHED");
  if (!organization) notFound();
  const department = data.departments.find((item) => item.slug === organization.departmentSlug);
  const events = data.events.filter((item) => item.organizationId === organization.id);
  const contactUrl = safeExternalUrl(organization.contactUrl);
  return <>
    <PageHeader eyebrow="Student organizations" title={organization.name} description={organization.description} breadcrumbs={[{ label: "Organizations", href: "/organizations" }, { label: organization.name }]} />
    <section className="section"><div className="container">
      {department && <p>Department: <Link className="link-arrow" href={`/departments/${department.slug}`}>{department.name}</Link></p>}
      {contactUrl && <a className="button" href={contactUrl} target="_blank" rel="noopener noreferrer">Official website / Contact<span className="sr-only"> (opens in a new tab)</span></a>}
      {events.length > 0 && <section className="detail-section"><SectionHeading eyebrow="Activities" title="Events" /><div className="data-grid">{events.map((event) => <EventCard key={event.id} event={event} />)}</div></section>}
      <div className="cta-row" style={{ marginTop: 24 }}><Link href="/organizations" className="link-arrow">Back to Organizations</Link></div>
    </div></section>
  </>;
}

import { EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { getSiteData } from "@/lib/store";
import { mediaDeliveryUrl, safeExternalUrl } from "@/lib/public-content";
import { isDocumentCollectionKey } from "@/lib/content-policy";
export const metadata = { title: "Resources & official links", description: "Official university services and IET documents and resources." };
export default async function ResourcesPage() {
  const data = await getSiteData();
  const links = data.links.filter((link) => safeExternalUrl(link.url));
  const documents = data.documents.filter((doc) => doc.mimeType === "application/pdf" && isDocumentCollectionKey(doc.key));
  return <><PageHeader eyebrow="Resources" title="Resources & official links" description="Find university services, institutional information and documents." breadcrumbs={[{ label: "Resources" }]} />
    <section className="section"><div className="container"><SectionHeading eyebrow="Official links" title="University & institute resources" />{links.length ? <div className="data-grid">{links.map((link) => <a className="data-card" href={safeExternalUrl(link.url)} target="_blank" rel="noopener noreferrer" key={link.id}><span className="tag">{link.owner}</span><h3>{link.label}</h3><p>{link.description}</p><span className="link-arrow">Open resource (new tab)</span></a>)}</div> : <EmptyState title="No resource links to display" />}</div></section>
    {documents.length > 0 && <section className="section soft"><div className="container"><SectionHeading eyebrow="IET resources" title="Documents" /><div className="data-grid">{documents.map((doc) => <a className="data-card" href={mediaDeliveryUrl(doc.key)} key={doc.id}><h3>{doc.title}</h3><p>{doc.description}</p><span className="link-arrow">Download PDF</span></a>)}</div></div></section>}
  </>;
}

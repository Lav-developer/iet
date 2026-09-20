import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params; const data = await getSiteData();
  const page = data.pages.find((item) => item.slug === slug && item.locale === "en");
  return { title: page?.title || "Page not found", description: page?.excerpt };
}
/** Plain text only: editorial page bodies are never rendered as untrusted HTML. */
export default async function InstitutionalPage({ params }: Props) {
  const { slug } = await params; const data = await getSiteData();
  const page = data.pages.find((item) => item.slug === slug && item.locale === "en");
  if (!page) notFound();
  return <><PageHeader eyebrow="IET / DSMNRU" title={page.title} description={page.excerpt || ""} breadcrumbs={[{ label: page.title }]} /><section className="section"><div className="container narrow" style={{ whiteSpace: "pre-line" }}>{page.body}</div></section></>;
}

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getSiteData } from "@/lib/store";
export const metadata = { title: "Privacy", description: "Privacy information and enquiries for the IET-DSMNRU website." };
export default async function PrivacyPage() {
  const data = await getSiteData();
  const policy = data.pages.find((page) => page.slug === "privacy" && page.locale === "en");
  return <><PageHeader eyebrow="Privacy" title="Privacy information" description="Information about using the IET-DSMNRU website." breadcrumbs={[{ label: "Privacy" }]} />
    <section className="section"><div className="container narrow">{policy ? <div style={{ whiteSpace: "pre-line" }}>{policy.body}</div> : <p>An institutional privacy policy is not available on this page yet. Please contact IET with privacy-related questions.</p>}<h2>External websites</h2><p>Links to university services and other websites take you to services with their own privacy terms.</p><Link className="link-arrow" href="/contact">Contact IET</Link></div></section></>;
}

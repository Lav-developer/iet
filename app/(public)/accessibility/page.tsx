import Link from "next/link";
import { PageHeader } from "@/components/ui";
export const metadata = { title: "Accessibility", description: "Accessibility options and help using the IET-DSMNRU website." };
export default function AccessibilityPage() {
  return <><PageHeader eyebrow="Accessibility" title="Using this website" description="Access academic information with keyboard navigation, adjustable text and display preferences." breadcrumbs={[{ label: "Accessibility" }]} />
    <section className="section"><div className="container narrow"><h2>Display preferences</h2><p>Use the accessibility button in the header to adjust text size, choose high contrast or reduce motion. You can reset your preferences at any time.</p><h2>Keyboard navigation</h2><p>Use Tab to move between links and controls, Enter to activate them, and the “Skip to main content” link to move past the header.</p><h2>Report a barrier</h2><p>If you have difficulty accessing a page or document, please contact the institute and describe the page and the help you need.</p><Link href="/contact" className="button">Contact IET</Link></div></section></>;
}

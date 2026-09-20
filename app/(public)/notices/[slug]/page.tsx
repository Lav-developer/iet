import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Info } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { formatNoticeDate, isExpired } from "@/lib/notices";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function findNotice(slug: string) {
  const data = await getSiteData();
  // getSiteData() already removes non-published notices and PDF notices whose
  // document is not published, so an unpublished notice cannot be reached here.
  return data.notices.find((item) => item.slug === slug);
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const notice = await findNotice(slug);
  return { title: notice?.title || "Notice not found", description: notice?.summary || (notice ? `Notice dated ${formatNoticeDate(notice.noticeDate)}.` : undefined) };
}

export default async function NoticePage({ params }: Props) {
  const { slug } = await params;
  const notice = await findNotice(slug);
  if (!notice) notFound();
  const isPdf = notice.noticeType === "PDF";
  const expired = isExpired(notice);

  return <>
    <PageHeader
      eyebrow="Notice board"
      title={notice.title}
      description={notice.summary || (isPdf ? "Official PDF notice." : "")}
      breadcrumbs={[{ label: "Notices", href: "/notices" }, { label: notice.title }]}
    />
    <section className="section"><div className="container narrow">
      <div className="notice-meta">
        <time className="notice-date" dateTime={new Date(notice.noticeDate).toISOString()}>{formatNoticeDate(notice.noticeDate)}</time>
        <span className={`notice-type${isPdf ? " pdf" : ""}`}>{isPdf ? "PDF notice" : "Notice"}</span>
        {notice.category && <span className="tag">{notice.category}</span>}
        {notice.departmentName && notice.departmentSlug && <Link className="link-arrow" href={`/departments/${notice.departmentSlug}`}>{notice.departmentName}</Link>}
      </div>

      {expired && <p className="notice-expired" role="note" style={{ marginTop: 20 }}>
        <Info size={14} aria-hidden="true" /> This notice expired on {formatNoticeDate(notice.expiryDate!)} and is kept here for reference.
      </p>}

      {isPdf && notice.pdf && <section className="detail-section" aria-labelledby="notice-document">
        <h2 id="notice-document">Official PDF</h2>
        <p className="small">The official notice is published as a PDF document. Open it in a new tab, or download it for offline reference.</p>
        <div className="cta-row">
          <a className="button" href={notice.pdf.url} target="_blank" rel="noopener noreferrer">
            <FileText size={16} aria-hidden="true" /> View PDF<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a className="button secondary" href={notice.pdf.url} download>
            <Download size={16} aria-hidden="true" /> Download PDF
          </a>
        </div>
      </section>}

      {notice.body && <section className="detail-section" aria-labelledby="notice-detail">
        <h2 id="notice-detail">{isPdf ? "Notice details" : "Notice"}</h2>
        <p className="notice-body">{notice.body}</p>
      </section>}

      <Link className="link-arrow" href="/notices">Back to all notices</Link>
    </div></section>
  </>;
}

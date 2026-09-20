import Link from "next/link";
import { Bell, FileText } from "lucide-react";
import { EmptyState, PageHeader, SectionHeading } from "@/components/ui";
import { currentNotices, formatNoticeDate, NOTICES_PAGE_SIZE } from "@/lib/notices";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notices", description: "Official notices published by the Institute of Engineering & Technology, DSMNRU." };

type Props = { searchParams: Promise<{ page?: string }> };

export default async function NoticesPage({ searchParams }: Props) {
  const { page } = await searchParams;
  const data = await getSiteData();
  const notices = currentNotices(data.notices);
  const totalPages = Math.max(1, Math.ceil(notices.length / NOTICES_PAGE_SIZE));
  const requested = Number.parseInt(String(page ?? "1"), 10);
  const currentPage = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;
  const visible = notices.slice((currentPage - 1) * NOTICES_PAGE_SIZE, currentPage * NOTICES_PAGE_SIZE);

  return <>
    <PageHeader
      eyebrow="Notice board"
      title="Notices"
      description="Official notices from the Institute of Engineering & Technology, DSMNRU. Each notice is published through the institutional editorial workflow."
      breadcrumbs={[{ label: "Notices" }]}
    />
    <section className="section">
      <div className="container">
        {notices.length === 0
          ? <EmptyState title="No notices are published" description="Official notices will appear here as soon as they are published." />
          : <>
            <SectionHeading eyebrow="Latest first" title="Published notices" description={`${notices.length} published notice${notices.length === 1 ? "" : "s"}.`} />
            <div className="notice-list">
              {visible.map((notice) => <article className="notice-card" key={notice.id}>
                <div>
                  <div className="notice-meta">
                    <time className="notice-date" dateTime={new Date(notice.noticeDate).toISOString()}>{formatNoticeDate(notice.noticeDate)}</time>
                    <span className={`notice-type${notice.noticeType === "PDF" ? " pdf" : ""}`}>{notice.noticeType === "PDF" ? "PDF notice" : "Notice"}</span>
                    {notice.category && <span className="tag">{notice.category}</span>}
                    {notice.departmentName && <span>{notice.departmentName}</span>}
                  </div>
                  <h3><Link href={`/notices/${notice.slug}`}>{notice.title}</Link></h3>
                  {notice.summary && <p>{notice.summary}</p>}
                </div>
                <div className="notice-actions">
                  <Link className="link-arrow" href={`/notices/${notice.slug}`}>View notice</Link>
                  {notice.noticeType === "PDF" && notice.pdf && <a className="link-arrow" href={notice.pdf.url} target="_blank" rel="noopener noreferrer">
                    <FileText size={15} aria-hidden="true" /> View PDF<span className="sr-only"> (opens in a new tab)</span>
                  </a>}
                </div>
              </article>)}
            </div>
            {totalPages > 1 && <nav className="notice-pagination" aria-label="Notices pagination">
              <span className="small">Page {currentPage} of {totalPages}</span>
              <div className="notice-pagination-links">
                {currentPage > 1 && <Link className="button secondary small-button" href={`/notices?page=${currentPage - 1}`} rel="prev">Previous notices</Link>}
                {currentPage < totalPages && <Link className="button secondary small-button" href={`/notices?page=${currentPage + 1}`} rel="next">Older notices</Link>}
              </div>
            </nav>}
          </>}
        {notices.length > 0 && <div className="cta-row" style={{ marginTop: 26 }}>
          <Link className="link-arrow" href="/resources"><Bell size={15} aria-hidden="true" /> University notices &amp; services</Link>
        </div>}
      </div>
    </section>
  </>;
}

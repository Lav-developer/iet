import Link from "next/link";
import { FileText } from "lucide-react";
import { SectionHeading } from "@/components/ui";
import { formatNoticeDate, homeNotices } from "@/lib/notices";
import type { Notice } from "@/lib/types";

/**
 * Homepage notice board: the latest published notices (newest first), each
 * with its date, the department or institute that issued it, whether it is a
 * text or PDF notice, and a direct "View PDF" link for PDF notices whose
 * document is published. Only published notices ever reach this component
 * (the public data set is filtered on the server), and only a published PDF
 * resolves to a `pdf` link.
 */
export function HomeNoticeBoard({ notices }: { notices: Notice[] }) {
  const latest = homeNotices(notices);
  return <section className="section tight home-notice-board">
    <div className="container">
      <SectionHeading eyebrow="Notice board" title="Latest notices" description="Official notices published by the Institute of Engineering & Technology (IET), DSMNRU." />
      {latest.length === 0
        ? <div className="home-notices"><p className="empty-state"><strong>No notices are published at the moment.</strong><span>New notices appear here as soon as they are published.</span></p><Link className="button secondary" href="/notices">View all notices</Link></div>
        : <div className="home-notices">
          <ul className="home-notice-list">
            {latest.map((notice) => {
              const isPdf = notice.noticeType === "PDF";
              return <li key={notice.id} className="home-notice-item">
                <div className="home-notice-main">
                  <div className="notice-meta">
                    <time className="notice-date" dateTime={new Date(notice.noticeDate).toISOString()}>{formatNoticeDate(notice.noticeDate)}</time>
                    <span className={`notice-type${isPdf ? " pdf" : ""}`}>{isPdf ? "PDF" : "Text"}</span>
                    <span>{notice.departmentName || "Institute of Engineering & Technology"}</span>
                  </div>
                  <Link className="home-notice-title" href={`/notices/${notice.slug}`}>{notice.title}</Link>
                </div>
                <div className="notice-actions">
                  <Link className="link-arrow" href={`/notices/${notice.slug}`}>{isPdf ? "Open" : "View"}<span className="sr-only">: {notice.title}</span></Link>
                  {isPdf && notice.pdf && <a className="link-arrow" href={notice.pdf.url} target="_blank" rel="noopener noreferrer"><FileText size={15} aria-hidden="true" /> View PDF<span className="sr-only"> for {notice.title} (opens in a new tab)</span></a>}
                </div>
              </li>;
            })}
          </ul>
          <Link className="button secondary" href="/notices">View all notices</Link>
        </div>}
    </div>
  </section>;
}

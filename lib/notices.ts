import type { Notice } from "@/lib/types";

export const NOTICES_PAGE_SIZE = 10;

/** Newest notice first, with a deterministic tie-break for identical dates. */
export function sortNotices(notices: Notice[]): Notice[] {
  return [...notices].sort((a, b) => {
    const difference = noticeTime(b) - noticeTime(a);
    if (difference !== 0) return difference;
    return String(a.slug).localeCompare(String(b.slug));
  });
}

function noticeTime(notice: Notice): number {
  const value = new Date(notice.noticeDate ?? 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** A notice stops being listed once its optional expiry date has passed. */
export function isExpired(notice: Notice, now: Date = new Date()): boolean {
  if (!notice.expiryDate) return false;
  const expiry = new Date(notice.expiryDate).getTime();
  return Number.isFinite(expiry) && expiry < now.getTime();
}

/** Publicly listed notices: current (non-expired) and published, newest first. */
export function currentNotices(notices: Notice[], now: Date = new Date()): Notice[] {
  return sortNotices(notices.filter((notice) => !isExpired(notice, now)));
}

export function formatNoticeDate(value: Notice["noticeDate"]): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
}

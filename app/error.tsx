"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep error details server-side; the public surface gets an actionable message only.
    console.error("Application route error", error.digest || error.message);
  }, [error]);
  return <main className="page-main"><section className="section"><div className="container"><div className="empty-state" role="alert"><strong>We could not load this page.</strong><span>The platform encountered a temporary problem. Please try again or use the main navigation.</span><button className="button small-button" onClick={() => reset()}>Try again</button></div></div></section></main>;
}

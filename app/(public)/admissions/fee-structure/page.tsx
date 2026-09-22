import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { FeeTable } from "@/components/fee-table";
import { PageHeader } from "@/components/ui";
import { FEE_SOURCE_NOTE, feeStructures } from "@/lib/fee-structure";

export const metadata = {
  title: "Fee Structure",
  description: "Semester-wise fee structure of the B.Tech (Under Self Finance Scheme) and M.Tech programmes at IET-DSMNRU, reproduced from the institutional fee structure document.",
};

/**
 * Public fee structure page. The tables are a faithful reproduction of the
 * institutional fee structure document (see lib/fee-structure.ts); the page
 * adds navigation and the source note only.
 */
export default function FeeStructurePage() {
  return <>
    <PageHeader
      eyebrow="Admissions"
      title="Fee structure"
      description="Semester-wise fee structure of the B.Tech (Under Self Finance Scheme) and M.Tech programmes at the Institute of Engineering & Technology (IET), Dr. Shakuntala Misra National Rehabilitation University."
      breadcrumbs={[{ label: "Admissions", href: "/admissions" }, { label: "Fee structure" }]}
    />
    <section className="section">
      <div className="container">
        <p className="source-note">{FEE_SOURCE_NOTE}</p>
        <nav className="fee-jump-links" aria-label="Fee structure sections">
          {feeStructures.map((programme) => <a key={programme.id} className="button secondary small-button" href={`#${programme.id}`}>{programme.title}</a>)}
          <a className="button secondary small-button" href="https://dsmru.up.nic.in/main/User/admission_pro.aspx" target="_blank" rel="noopener noreferrer">Official DSMNRU admissions <ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
        </nav>
        {feeStructures.map((programme) => <section key={programme.id} id={programme.id} className="fee-programme" aria-labelledby={`${programme.id}-heading`}>
          <div className="section-head"><div><div className="eyebrow">Semester-wise fees</div><h2 id={`${programme.id}-heading`}>{programme.title}</h2></div></div>
          <div className="fee-tables">
            {programme.tables.map((table) => <FeeTable key={table.id} table={table} labelledBy={programme.tables.length === 1 ? `${programme.id}-heading` : undefined} />)}
          </div>
        </section>)}
        <p className="source-note">{FEE_SOURCE_NOTE}</p>
        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link href="/admissions" className="button secondary">Back to admissions</Link>
          <Link href="/programs" className="button secondary">Explore programmes</Link>
        </div>
      </div>
    </section>
  </>;
}

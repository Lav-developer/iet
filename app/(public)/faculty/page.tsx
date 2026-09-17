import { PageHeader, SectionHeading, SourceNote } from "@/components/ui";
import { FacultyDirectory } from "@/components/faculty-directory";
import { getSiteData } from "@/lib/store";

export const metadata = { title: "Faculty directory", description: "Searchable IET-DSMNRU faculty, leadership and laboratory staff directory." };

export default async function FacultyPage() {
  const data = await getSiteData();
  return <>
    <PageHeader eyebrow="People" title="A directory that can be maintained." description="Search IET faculty and staff by department, designation, qualification and published research interests. Profiles remain editable without touching frontend code." breadcrumbs={[{ label: "People" }, { label: "Faculty" }]} />
    <section className="section"><div className="container"><SectionHeading eyebrow="Faculty / staff" title="Find a person." description="The supplied PDF provides detailed profiles for the people shown here. The directory leaves room for approved CVs, publications and projects." /><FacultyDirectory faculty={data.faculty} departments={data.departments} /><div style={{ marginTop: 28 }}><SourceNote>Faculty and staff names, designations, qualifications and contact details are seeded from the supplied IET-DSMNRU profile PDF, pages 6–20. Contact details should be confirmed by IET before production publication.</SourceNote></div></div></section>
  </>;
}

import { DepartmentContacts } from "@/components/department-contacts";
import { requireAdminSection } from "@/lib/admin-sections";

export default async function DepartmentContactsPage() {
  await requireAdminSection("departmentContacts");
  return <DepartmentContacts />;
}

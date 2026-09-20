import { AuditLog } from "@/components/audit-log";
import { requireAdminSection } from "@/lib/admin-sections";

export default async function AuditPage() {
  await requireAdminSection("audit");
  return <AuditLog />;
}

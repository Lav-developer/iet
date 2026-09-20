import { UsersAdmin } from "@/components/users-admin";
import { requireAdminSection } from "@/lib/admin-sections";

export default async function UsersPage() {
  await requireAdminSection("users");
  return <UsersAdmin />;
}

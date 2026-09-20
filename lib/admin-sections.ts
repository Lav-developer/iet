import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { canConfigureDepartmentContacts, canManageUsers, canViewAuditLogs, type AdminSection } from "@/lib/content-policy";

/**
 * Server-side gate for the workspace pages that are not part of every role's
 * CMS (Users, Audit logs, Department contacts).
 *
 * The navigation already hides these sections, but a hidden link is not a
 * protection: visiting the URL directly is refused here, before the page is
 * rendered, using the same policy the API enforces. The API re-checks every
 * request as well, so this is defence in depth rather than the only check.
 */
export async function requireAdminSection(section: Exclude<AdminSection, "dashboard">): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/admin/login");

  if (section === "users" && !canManageUsers(user)) redirect("/admin");
  if (section === "audit" && !canViewAuditLogs(user)) redirect("/admin");
  if (section === "departmentContacts") {
    const assigned = await assignedDepartmentSlug(user.departmentId);
    if (!canConfigureDepartmentContacts(user, assigned || "", assigned)) redirect("/admin");
  }
  return user;
}

async function assignedDepartmentSlug(departmentId: string | undefined): Promise<string | undefined> {
  if (!departmentId) return undefined;
  const prisma = getPrisma();
  if (!prisma) return undefined;
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { slug: true } });
  return department?.slug;
}

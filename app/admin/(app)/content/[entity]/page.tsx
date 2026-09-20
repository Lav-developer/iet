import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntityManager } from "@/components/entity-manager";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { entityCapability, isEntityName, visibleEntities } from "@/lib/content-policy";
import type { EntityName } from "@/lib/types";

/**
 * Content workspace for one entity.
 *
 * The role's capability is resolved here, on the server, from the authenticated
 * session and the shared policy — the client never decides what it may do. The
 * API re-authorizes every read and write regardless of what this page renders.
 */
export default async function AdminEntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isEntityName(entity)) notFound();
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const assignedDepartmentSlug = await assignedDepartmentSlugFor(user.departmentId);
  // A role that cannot see this entity at all is sent back to its dashboard
  // instead of being shown an empty workspace. The API refuses the reads and
  // writes for the same entity regardless of what this page does.
  if (!visibleEntities(user).some((entry) => entry.entity === entity)) redirect("/admin");
  const capability = entityCapability(user, entity as EntityName, assignedDepartmentSlug);
  return <><div style={{ marginBottom: 20 }}><Link href="/admin" className="link-arrow">Back to dashboard</Link></div><EntityManager entity={entity as EntityName} capability={capability} /></>;
}

async function assignedDepartmentSlugFor(departmentId: string | undefined): Promise<string | undefined> {
  if (!departmentId) return undefined;
  const prisma = getPrisma();
  if (!prisma) return undefined;
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { slug: true } });
  return department?.slug;
}

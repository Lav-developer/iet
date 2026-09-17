import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Server-side authentication gate for every /admin workspace page.
 * Unauthenticated visitors are redirected to /admin/login before any page
 * component runs. This complements (does not replace) the per-route
 * authorization checks in the admin API, which remain the enforcement layer.
 */
export default async function AdminGateLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  return <>{children}</>;
}

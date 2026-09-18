import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * Server-side authentication gate for every /admin workspace page.
 * Unauthenticated visitors are redirected to /admin/login before any page
 * component runs. This complements (does not replace) the per-route
 * authorization checks in the admin API, which remain the enforcement layer.
 *
 * The gate reads the session cookie at request time, so this tree must never
 * be prerendered at build time — doing so would require production
 * configuration (DATABASE_URL, AUTH_SECRET, …) to exist on the build
 * machine. Same pattern as the public tree's layout.
 */
export const dynamic = "force-dynamic";

export default async function AdminGateLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  return <>{children}</>;
}

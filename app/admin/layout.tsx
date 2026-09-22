import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getSession } from "@/lib/auth";

/**
 * Server-side authentication gate for the whole /admin workspace.
 *
 * The session is read on the server for every request to any /admin page;
 * an unauthenticated visitor is redirected to /admin/login before any page
 * component runs. This complements (does not replace) the per-request
 * authorization in the admin API routes, which remain the enforcement layer
 * for every read and write.
 *
 * The sign-in page itself lives outside this layout (app/(auth)/admin/login),
 * so it stays reachable without a session and can never redirect to itself.
 *
 * The gate reads the session cookie at request time, so this tree must never
 * be prerendered at build time — doing so would require production
 * configuration (DATABASE_URL, AUTH_SECRET, …) to exist on the build machine.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}

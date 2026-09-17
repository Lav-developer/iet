import { PublicShell } from "@/components/public-shell";

// Institutional content must reflect CMS changes without a frontend rebuild.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell>{children}</PublicShell>;
}

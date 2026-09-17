import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAuditEntries } from "@/lib/store";

export async function GET() {
  try {
    const user = await requireAdmin();
    if (user.role !== "SUPER_ADMIN" && user.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const logs = await getAuditEntries();
    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error && error.message === "UNAUTHORIZED" ? "Unauthorized" : "Unable to load audit log.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getAuditEntries } from "@/lib/store";

const pageLimitSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    if (user.role !== "SUPER_ADMIN" && user.role !== "IET_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { page, limit } = pageLimitSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await getAuditEntries(page, limit);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message === "UNAUTHORIZED" ? "Unauthorized" : "Unable to load audit log.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

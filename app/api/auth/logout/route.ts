import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export async function POST(request: Request) { if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 }); await clearSession(); return NextResponse.json({ ok: true }); }

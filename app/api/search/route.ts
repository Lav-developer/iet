import { NextResponse } from "next/server";
import { searchSite } from "@/lib/store";
import { consumeRateLimit } from "@/lib/security";

export async function GET(request: Request) {
  const limit = await consumeRateLimit(request, "public:search", 60, 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many searches. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) || "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchSite(query) });
  } catch (error) {
    console.error("Search failed", error);
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 500 });
  }
}

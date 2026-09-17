import { getRuntimeConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  const origin = getRuntimeConfig().siteUrl || "http://localhost:3000";
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}

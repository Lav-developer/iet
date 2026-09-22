import { getRuntimeConfig } from "@/lib/config";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const data = await getSiteData();
  const origin = getRuntimeConfig().siteUrl || "http://localhost:3000";
  const urls = ["/", "/notices", "/about", "/infrastructure", "/departments", "/programs", "/faculty", "/people", "/search", "/laboratories", "/research", "/projects", "/publications", "/events", "/achievements", "/campus", "/organizations", "/admissions", "/admissions/fee-structure", "/career", "/resources", "/contact", "/accessibility", "/privacy", ...data.organizations.map((item) => `/organizations/${item.slug}`), ...data.pages.filter((item) => item.locale === "en").map((item) => `/${item.slug}`), ...data.notices.map((item) => `/notices/${item.slug}`),
    ...data.departments.map((item) => `/departments/${item.slug}`), ...data.programs.map((item) => `/programs/${item.slug}`), ...data.faculty.map((item) => `/faculty/${item.slug}`), ...data.laboratories.map((item) => `/laboratories/${item.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map((url) => `<url><loc>${escapeXml(origin + url)}</loc></url>`).join("")}</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
}

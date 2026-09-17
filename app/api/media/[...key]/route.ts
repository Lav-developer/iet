import { NextResponse } from "next/server";
import { getEntity } from "@/lib/store";
import { getObject } from "@/lib/storage";

const safeMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

type Params = { params: Promise<{ key: string[] }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { key: segments } = await params;
    const key = segments.map((part) => decodeURIComponent(part)).join("/");
    const [media, documents] = await Promise.all([getEntity("media", true), getEntity("documents", false)]);
    const record = [...media, ...documents].find((item) => (item as { key?: string }).key === key) as { key: string; url?: string; mimeType?: string; title?: string } | undefined;
    if (!record || !record.mimeType || !safeMimeTypes.has(record.mimeType)) return NextResponse.json({ error: "Object not found." }, { status: 404 });
    const body = await getObject(record.key);
    const filename = (record.title || record.key.split("/").pop() || "download").replace(/[^a-zA-Z0-9._ -]/g, "_");
    const isDocument = record.mimeType === "application/pdf";
    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `${isDocument ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof Error && /not found|invalid object key/i.test(error.message)) return NextResponse.json({ error: "Object not found." }, { status: 404 });
    console.error("Media download failed", error);
    return NextResponse.json({ error: "Unable to retrieve object." }, { status: 500 });
  }
}

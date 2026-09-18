import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { databaseConfigured } from "@/lib/db";
import { getEntity } from "@/lib/store";
import { getObject } from "@/lib/storage";
import { resolveMediaDelivery, type DocumentCandidate, type MediaCandidate } from "@/lib/media-policy";

const SAFE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

type Params = { params: Promise<{ key: string[] }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { key: segments } = await params;
    const key = segments.map((part) => decodeURIComponent(part)).join("/");

    let mediaRecord: MediaCandidate | null = null;
    let documentRecord: DocumentCandidate | null = null;

    if (databaseConfigured) {
      // Targeted single-row lookups — one indexed query per collection,
      // never the whole dataset.
      const prisma = getPrisma();
      if (!prisma) return NextResponse.json({ error: "Object not found." }, { status: 404 });
      const [media, document] = await Promise.all([
        prisma.media.findFirst({ where: { key }, select: { key: true, mimeType: true, altText: true } }),
        prisma.document.findFirst({ where: { key }, select: { key: true, mimeType: true, status: true, title: true } }),
      ]);
      mediaRecord = media;
      documentRecord = document ? { key: document.key, mimeType: document.mimeType, status: document.status, title: document.title } : null;
    } else {
      // Local development fallback (file-backed demo store).
      const [media, documents] = await Promise.all([getEntity("media", true), getEntity("documents", false)]);
      const foundMedia = (media as Array<{ key?: string; mimeType?: string }>).find((item) => item.key === key);
      const foundDocument = (documents as Array<{ key?: string; mimeType?: string; status?: string; title?: string }>).find((item) => item.key === key);
      mediaRecord = foundMedia ? { key: String(foundMedia.key), mimeType: String(foundMedia.mimeType) } : null;
      documentRecord = foundDocument ? { key: String(foundDocument.key), mimeType: String(foundDocument.mimeType), status: String(foundDocument.status), title: foundDocument.title } : null;
    }

    // Document records take precedence; documents serve only when PUBLISHED.
    const decision = resolveMediaDelivery(mediaRecord, documentRecord);
    if (!decision.serve || !SAFE_CONTENT_TYPES.has(decision.record.mimeType)) {
      return NextResponse.json({ error: "Object not found." }, { status: 404 });
    }

    const body = await getObject(decision.record.key);
    const filename = (decision.record.title || decision.record.key.split("/").pop() || "download").replace(/[^a-zA-Z0-9._ -]/g, "_");
    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": decision.record.mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `${decision.isDocument ? "attachment" : "inline"}; filename="${filename}"`,
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

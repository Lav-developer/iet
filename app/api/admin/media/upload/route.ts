import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit, isSameOrigin, trustedClientIp } from "@/lib/security";
import { deleteObject, describeStorageError, objectUrl, putObject, randomObjectKey, validateMagicBytes, validateUpload } from "@/lib/storage";
import { upsertEntity } from "@/lib/store";

export const runtime = "nodejs";

function requestIp(request: Request) {
  // Derived from the trusted proxy chain (see lib/security.ts), never from
  // raw client headers, so audit attribution cannot be spoofed.
  return trustedClientIp(request);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  try {
    const user = await requireAdmin();
    const limit = await consumeRateLimit(request, "admin:upload", 30, 10 * 60 * 1000, user.id);
    if (!limit.allowed) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const form = await request.formData();
    const file = form.get("file");
    const collection = form.get("collection") === "documents" ? "documents" : "media";
    if (!(file instanceof File)) return NextResponse.json({ error: "A file is required." }, { status: 400 });
    if (file.name.length > 180) return NextResponse.json({ error: "The file name is too long." }, { status: 400 });
    try {
      validateUpload(file.type, file.size, collection);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "File type or size is not allowed." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) return NextResponse.json({ error: "The file content does not match its declared type." }, { status: 400 });

    const altText = String(form.get("altText") || "").trim();
    const caption = String(form.get("caption") || "").trim();
    if (altText.length > 300 || caption.length > 500) return NextResponse.json({ error: "Alt text or caption is too long." }, { status: 400 });
    if (collection === "media" && !altText) return NextResponse.json({ error: "Alternative text is required for images. Use a concise description or state that the image is decorative." }, { status: 400 });

    const departmentSlug = String(form.get("departmentSlug") || "").trim() || undefined;
    if (user.role === "DEPARTMENT_ADMIN") {
      if (collection !== "documents" || !departmentSlug || !user.departmentId) return NextResponse.json({ error: "Department administrators may upload only scoped department documents." }, { status: 403 });
      const prisma = getPrisma();
      const department = prisma ? await prisma.department.findUnique({ where: { id: user.departmentId }, select: { slug: true } }) : null;
      if (!department || department.slug !== departmentSlug) return NextResponse.json({ error: "Department ownership check failed." }, { status: 403 });
    }
    const status = String(form.get("status") || "DRAFT");
    if ((user.role === "EDITOR" || user.role === "DEPARTMENT_ADMIN") && ["PUBLISHED", "ARCHIVED"].includes(status)) return NextResponse.json({ error: "This role cannot publish or archive uploads." }, { status: 403 });

    const key = randomObjectKey(collection, file.name);
    const stored = await putObject({ key, body: buffer, contentType: file.type });
    try {
      const common = { key: stored.key, url: objectUrl(stored.key), mimeType: file.type, sizeBytes: file.size, altText };
      const record = collection === "media"
        ? await upsertEntity("media", { ...common, caption }, user.email, undefined, user.id, user.role, requestIp(request))
        : await upsertEntity("documents", { ...common, title: String(form.get("title") || file.name).trim().slice(0, 200), description: caption, departmentSlug, status }, user.email, undefined, user.id, user.role, requestIp(request));
      return NextResponse.json({ record }, { status: 201 });
    } catch (error) {
      await deleteObject(stored.key).catch((cleanupError) => console.error("Upload cleanup failed", cleanupError));
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // The real cause is always logged; the response carries a safe, actionable
    // message instead of a bare "Upload failed." (the message a rejected
    // storage request used to produce).
    console.error("Upload failed", error);
    if (error instanceof Error && error.message.startsWith("INVALID_INPUT")) return NextResponse.json({ error: error.message.replace("INVALID_INPUT: ", "") }, { status: 400 });
    const described = describeStorageError(error);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }
}

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getRuntimeConfig, isProduction } from "@/lib/config";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DOCUMENT_TYPES = new Set(["application/pdf"]);

let client: S3Client | undefined;

function storageConfig() {
  const config = getRuntimeConfig();
  const values = [config.storageEndpoint, config.storageBucket, config.storageAccessKey, config.storageSecretKey];
  const configuredCount = values.filter(Boolean).length;
  if (!configuredCount) return null;
  if (configuredCount !== values.length) throw new Error("Object storage configuration is incomplete.");
  if (!client) {
    client = new S3Client({
      endpoint: config.storageEndpoint,
      region: process.env.STORAGE_REGION || "auto",
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: config.storageAccessKey!, secretAccessKey: config.storageSecretKey! },
    });
  }
  return { client, bucket: config.storageBucket! };
}

export function validateUpload(mimeType: string, size: number, collection: "media" | "documents") {
  const allowed = collection === "media" ? IMAGE_TYPES : DOCUMENT_TYPES;
  const maxBytes = collection === "media" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
  if (!allowed.has(mimeType)) throw new Error(collection === "media" ? "Only PNG, JPEG, WebP or GIF images are allowed." : "Only PDF documents are allowed.");
  if (size > maxBytes) throw new Error(`File is too large. Maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
}

export function validateMagicBytes(buffer: Buffer, mimeType: string) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return mimeType === "image/jpeg" ? isJpeg : mimeType === "image/png" ? isPng : mimeType === "image/gif" ? isGif : mimeType === "image/webp" ? isWebp : mimeType === "application/pdf" ? isPdf : false;
}

function safeKey(key: string) {
  if (!key || key.length > 300 || key.startsWith("/") || key.includes("..") || !/^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(key)) throw new Error("Invalid object key.");
  return key;
}

export function objectUrl(key: string) {
  safeKey(key);
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Server-side encryption is opt-in.
 *
 * AWS S3 accepts the `x-amz-server-side-encryption` header, but S3-compatible
 * services do not all implement it — Cloudflare R2, for example, lists SSE as
 * not implemented for PutObject, and the request is rejected when the header is
 * sent. R2 encrypts every object at rest regardless, so the default is to leave
 * object-level SSE to the storage provider and to send the header only when an
 * operator explicitly configures `STORAGE_SERVER_SIDE_ENCRYPTION=AES256` (or
 * `aws:kms`) for a store that requires it.
 */
function serverSideEncryption(): "AES256" | "aws:kms" | undefined {
  const configured = process.env.STORAGE_SERVER_SIDE_ENCRYPTION?.trim();
  return configured === "AES256" || configured === "aws:kms" ? configured : undefined;
}

/**
 * Maps a storage failure to a safe, actionable message. Provider errors are
 * logged by the caller; the message never includes credentials, endpoints or
 * stack traces.
 */
export function describeStorageError(error: unknown): { status: number; message: string } {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (["NoSuchBucket", "InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied", "InvalidRequest", "IncompleteBody"].includes(name)) {
    return { status: 503, message: "Object storage rejected the upload. Check STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY." };
  }
  if (error instanceof Error && error.message === "Object storage configuration is incomplete.") {
    return { status: 503, message: "Object storage is only partially configured. Set all of STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY." };
  }
  return { status: 502, message: "The upload service is temporarily unavailable. Please try again in a moment." };
}

export async function putObject(input: { key: string; body: Buffer; contentType: string }) {
  const key = safeKey(input.key);
  const configured = storageConfig();
  if (configured) {
    const encryption = serverSideEncryption();
    await configured.client.send(new PutObjectCommand({
      Bucket: configured.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
      ...(encryption ? { ServerSideEncryption: encryption } : {}),
    }));
  } else {
    if (isProduction) throw new Error("Object storage is required in production.");
    const destination = path.join(process.cwd(), ".data", "uploads", key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.body, { flag: "wx" });
  }
  return { key, url: objectUrl(key) };
}

export async function deleteObject(key: string) {
  const safe = safeKey(key);
  const configured = storageConfig();
  if (configured) {
    await configured.client.send(new DeleteObjectCommand({ Bucket: configured.bucket, Key: safe }));
    return;
  }
  if (isProduction) throw new Error("Object storage is required in production.");
  const { unlink } = await import("node:fs/promises");
  await unlink(path.join(process.cwd(), ".data", "uploads", safe)).catch(() => undefined);
}

export async function getObject(key: string) {
  const safe = safeKey(key);
  const configured = storageConfig();
  if (configured) {
    const result = await configured.client.send(new GetObjectCommand({ Bucket: configured.bucket, Key: safe }));
    if (!result.Body) throw new Error("Object not found.");
    const bytes = "transformToByteArray" in result.Body && typeof result.Body.transformToByteArray === "function"
      ? await result.Body.transformToByteArray()
      : Buffer.from(await new Response(result.Body as BodyInit).arrayBuffer());
    return Buffer.from(bytes);
  }
  if (isProduction) throw new Error("Object storage is required in production.");
  return readFile(path.join(process.cwd(), ".data", "uploads", safe));
}

export function randomObjectKey(collection: "media" | "documents", originalName: string) {
  const extension = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${collection}/${new Date().getFullYear()}/${randomUUID()}.${extension}`;
}

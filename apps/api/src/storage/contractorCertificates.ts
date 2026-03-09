import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { put } from "@vercel/blob";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeName(name: string): string {
  return String(name ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function extFromMime(mime: string): string {
  const m = String(mime ?? "").toLowerCase();
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "application/pdf") return ".pdf";
  return ".jpg";
}

function certTypeFromMime(mime: string): string {
  const m = String(mime ?? "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "application/pdf") return "pdf";
  return "jpg";
}

function isVercelRuntime(): boolean {
  return String(process.env.VERCEL ?? "").trim() === "1";
}

export async function storeContractorCertificate(opts: {
  userId: string;
  originalName: string;
  mimeType: string;
  buf: Buffer;
}): Promise<{ publicUrl: string; sha256: string; sizeBytes: number; certificateType: string }> {
  if (!opts.buf.length) throw Object.assign(new Error("Empty file"), { status: 400 });

  const mime = String(opts.mimeType ?? "").toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    throw Object.assign(
      new Error("Unsupported file type. Allowed: jpg, png, webp, pdf"),
      { status: 400, code: "CERT_INVALID_TYPE" },
    );
  }

  if (opts.buf.length > MAX_BYTES) {
    throw Object.assign(new Error("File too large (max 5 MB)"), { status: 400, code: "CERT_FILE_TOO_LARGE" });
  }

  const digest = sha256(opts.buf);
  const ext = extFromMime(mime);
  const fileName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeName(opts.originalName || "cert")}${ext}`;
  const certificateType = certTypeFromMime(mime);

  const blobToken = String(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
  const shouldUseBlob = Boolean(blobToken) || isVercelRuntime() || process.env.NODE_ENV === "production";

  if (shouldUseBlob) {
    if (!blobToken) {
      throw Object.assign(new Error("BLOB_READ_WRITE_TOKEN is required for uploads in production"), { status: 500 });
    }

    const key = path.posix.join("contractor-certificates", opts.userId, fileName);
    const res = await put(key, opts.buf, {
      access: "public",
      contentType: mime,
      token: blobToken,
      addRandomSuffix: false,
    });

    return { publicUrl: res.url, sha256: digest, sizeBytes: opts.buf.length, certificateType };
  }

  // Dev: disk storage
  const rel = path.posix.join("uploads", "contractor-certificates", opts.userId, fileName);
  const abs = path.join(process.cwd(), "public", rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, opts.buf);

  return { publicUrl: `/${rel}`, sha256: digest, sizeBytes: opts.buf.length, certificateType };
}

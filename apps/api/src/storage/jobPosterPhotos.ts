import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeName(name: string): string {
  return String(name ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function extFromMime(mime: string): ".jpg" | ".png" | ".webp" {
  const m = String(mime ?? "").toLowerCase();
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  return ".jpg";
}

export async function storeJobPosterPhoto(opts: {
  userId: string;
  originalName: string;
  mimeType: string;
  buf: Buffer;
}): Promise<{ publicUrl: string; sha256: string; sizeBytes: number }> {
  if (!opts.buf.length) throw Object.assign(new Error("Empty file"), { status: 400 });
  const mime = String(opts.mimeType ?? "").toLowerCase();
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    throw Object.assign(new Error("Unsupported file type"), { status: 400 });
  }

  const digest = sha256(opts.buf);
  const fileName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeName(opts.originalName || "photo")}${extFromMime(mime)}`;

  // DEV/STAGING FRIENDLY:
  // Store under Next.js public/ so the file is retrievable via HTTP.
  // Production should swap this to durable object storage (S3/R2) later.
  const rel = path.posix.join("uploads", "job-poster-photos", opts.userId, fileName);
  const abs = path.join(process.cwd(), "public", rel);

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, opts.buf);

  return { publicUrl: `/${rel}`, sha256: digest, sizeBytes: opts.buf.length };
}


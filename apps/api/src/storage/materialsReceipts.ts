import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export async function storeMaterialsReceiptFile(opts: {
  submissionId: string;
  originalName: string;
  mimeType: string;
  base64: string;
}): Promise<{ storageKey: string; sizeBytes: number; sha256: string }> {
  const clean = opts.base64.replace(/^data:[^;]+;base64,/, "").trim();
  const buf = Buffer.from(clean, "base64");
  if (!buf.length) throw Object.assign(new Error("Empty receipt file"), { status: 400 });

  const digest = sha256(buf);
  const ext =
    opts.mimeType === "application/pdf"
      ? ".pdf"
      : opts.mimeType === "image/png"
        ? ".png"
        : opts.mimeType === "image/webp"
          ? ".webp"
          : ".jpg";

  const fileName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeName(opts.originalName || "receipt")}${ext}`;
  const rel = path.posix.join("uploads", "materials-receipts", opts.submissionId, fileName);
  const abs = path.join(process.cwd(), rel);

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);

  return { storageKey: rel, sizeBytes: buf.length, sha256: digest };
}


import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { storeJobPosterPhoto } from "@/src/storage/jobPosterPhotos";
import { badRequest } from "@/src/services/v4/v4Errors";

const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadV4JobPhoto(userId: string, file: File) {
  if (typeof file.size === "number" && file.size > MAX_BYTES) {
    throw badRequest("V4_UPLOAD_FILE_TOO_LARGE", "File too large");
  }

  const mimeType = String(file.type ?? "").trim();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw badRequest("V4_UPLOAD_FILE_TOO_LARGE", "File too large");
  }

  const stored = await storeJobPosterPhoto({
    userId,
    originalName: file.name || "photo",
    mimeType,
    buf,
  });

  const uploadId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(v4JobUploads).values({
      id: uploadId,
      userId,
      url: stored.publicUrl,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      createdAt: new Date(),
      usedAt: null,
    });
  });

  return { ok: true as const, uploadId, url: stored.publicUrl };
}

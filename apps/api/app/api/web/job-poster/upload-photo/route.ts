import { NextResponse } from "next/server";
import { requireJobPoster } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { storeJobPosterPhoto } from "../../../../../src/storage/jobPosterPhotos";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: Request) {
  try {
    const u = await requireJobPoster(req);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    if (typeof file.size === "number" && file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });
    }

    const mimeType = String(file.type ?? "").trim();
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });
    }

    const stored = await storeJobPosterPhoto({
      userId: u.userId,
      originalName: file.name || "photo",
      mimeType,
      buf,
    });

    return NextResponse.json({ ok: true, url: stored.publicUrl }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}


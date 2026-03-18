/**
 * LGS Outreach: Import contractor contacts from CSV/Excel.
 */
import { NextResponse } from "next/server";
import { importContactsFromFile } from "@/src/services/lgs/outreachContactImportService";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const result = await importContactsFromFile(buffer, mimeType);
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    console.error("LGS outreach import error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "import_failed" },
      { status: 500 }
    );
  }
}

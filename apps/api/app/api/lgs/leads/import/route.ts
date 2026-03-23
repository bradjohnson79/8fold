/**
 * LGS: Import contractor leads from CSV/XLSX.
 * Supports website-only rows plus optional structured lead fields.
 */
import { NextResponse } from "next/server";
import { importStructuredLeadRows } from "@/src/services/lgs/importLeadsService";
import { parseDomainFile } from "@/src/services/lgs/parseDomainFile";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    let parsed: ReturnType<typeof parseDomainFile>;
    try {
      parsed = parseDomainFile(buffer, mimeType);
    } catch (parseErr) {
      return NextResponse.json(
        { ok: false, error: parseErr instanceof Error ? parseErr.message : "invalid_file" },
        { status: 400 }
      );
    }

    const { rows, stats } = parsed;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No valid domains found. ${stats.skipped_empty > 0 ? `${stats.skipped_empty} rows had no website.` : ""} ${stats.skipped_blocked > 0 ? `${stats.skipped_blocked} rows were social media / directory sites.` : ""} File must have a 'website' or 'domain' column.`.trim(),
          stats,
        },
        { status: 400 }
      );
    }

    const summary = await importStructuredLeadRows(rows, {
      forceCampaignType: "contractor",
      source: "lead_import",
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...summary,
        parse_stats: stats,
      },
    });
  } catch (err) {
    console.error("LGS leads import error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "import_failed" },
      { status: 500 }
    );
  }
}

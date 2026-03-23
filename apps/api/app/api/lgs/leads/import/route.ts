/**
 * LGS: Import contractor websites from CSV/XLSX.
 * Extracts domains (+ optional city/state/country), queues for discovery, auto-imports leads when complete.
 * Required column: website (or domain, url) — case-insensitive.
 * Optional columns: city, state, country — case-insensitive.
 */
import { NextResponse } from "next/server";
import { runBulkDomainDiscoveryAsync } from "@/src/services/lgs/domainDiscoveryService";
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

    const runId = await runBulkDomainDiscoveryAsync(rows, {
      autoImportSource: "website_import",
    });

    return NextResponse.json({
      ok: true,
      data: {
        run_id: runId,
        domains_total: rows.length,
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

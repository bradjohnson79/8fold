/**
 * LGS: Import leads from CSV/XLSX website lists.
 * Extracts domains (+ optional city/state/country), queues for discovery, auto-imports leads when complete.
 * Required column: website (or domain, url) — case-insensitive.
 * Optional columns: city, state, country — case-insensitive.
 */
import { NextResponse } from "next/server";
import { runBulkDomainDiscoveryAsync } from "@/src/services/lgs/domainDiscoveryService";
import { parseDomainFile } from "@/src/services/lgs/parseDomainFile";

function normalizeLeadType(value: FormDataEntryValue | null): "contractor" | "job_poster" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "job_poster" ? "job_poster" : "contractor";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const leadType = normalizeLeadType(formData.get("lead_type"));
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
    const rowsWithLeadType = rows.map((row) => ({
      ...row,
      campaignType: row.campaignType ?? (leadType === "job_poster" ? "jobs" : "contractor"),
    }));

    if (rowsWithLeadType.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No valid domains found. ${stats.skipped_empty > 0 ? `${stats.skipped_empty} rows had no website.` : ""} ${stats.skipped_blocked > 0 ? `${stats.skipped_blocked} rows were social media / directory sites.` : ""} File must have a 'website' or 'domain' column.`.trim(),
          stats,
        },
        { status: 400 }
      );
    }

    const runId = await runBulkDomainDiscoveryAsync(rowsWithLeadType, {
      autoImportSource: "website_import",
      campaignType: leadType === "job_poster" ? "jobs" : "contractor",
    });

    return NextResponse.json({
      ok: true,
      data: {
        run_id: runId,
        domains_total: rowsWithLeadType.length,
        lead_type: leadType,
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

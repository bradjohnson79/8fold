/**
 * LGS: Bulk domain discovery via CSV/XLSX upload or JSON body.
 * Starts async discovery, returns run_id immediately.
 */
import { NextResponse } from "next/server";
import { runBulkDomainDiscoveryAsync } from "@/src/services/lgs/domainDiscoveryService";
import { parseDomainFile } from "@/src/services/lgs/parseDomainFile";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
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
          { ok: false, error: "No valid domains found. File must have a 'domain' or 'website' column.", stats },
          { status: 400 }
        );
      }

      const runId = await runBulkDomainDiscoveryAsync(rows);
      return NextResponse.json({ ok: true, data: { run_id: runId, domains_total: rows.length, parse_stats: stats } });
    }

    // JSON body
    const body = (await req.json().catch(() => ({}))) as {
      domains?: string[] | Array<{ domain: string; city?: string; state?: string; country?: string }>;
    };
    const domainInput = body.domains;
    if (!Array.isArray(domainInput) || domainInput.length === 0) {
      return NextResponse.json({ ok: false, error: "domains_required" }, { status: 400 });
    }

    const runId = await runBulkDomainDiscoveryAsync(domainInput as string[]);
    return NextResponse.json({ ok: true, data: { run_id: runId, domains_total: domainInput.length } });
  } catch (err) {
    console.error("LGS discovery bulk error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "discovery_failed" },
      { status: 500 }
    );
  }
}

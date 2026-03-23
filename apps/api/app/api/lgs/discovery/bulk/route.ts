/**
 * LGS: Bulk domain discovery via CSV/XLSX upload or JSON body.
 * Starts async discovery for website-only uploads and falls back to structured
 * lead ingestion when import fields are supplied.
 */
import { NextResponse } from "next/server";
import { runBulkDomainDiscoveryAsync } from "@/src/services/lgs/domainDiscoveryService";
import {
  importStructuredLeadRows,
  shouldUseStructuredImport,
} from "@/src/services/lgs/importLeadsService";
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

      if (shouldUseStructuredImport(rows)) {
        const summary = await importStructuredLeadRows(rows, {
          source: "discovery_bulk_import",
        });
        return NextResponse.json({
          ok: true,
          data: {
            ...summary,
            parse_stats: stats,
          },
        });
      }

      const contractorRows = rows
        .filter((row) => (row.campaignType ?? "contractor") === "contractor")
        .map((row) => ({ ...row, campaignType: "contractor" as const }));
      const jobRows = rows
        .filter((row) => row.campaignType === "jobs")
        .map((row) => ({ ...row, campaignType: "jobs" as const }));

      const runResults: Array<{ campaign_type: "contractor" | "jobs"; run_id: string; domains_total: number }> = [];
      if (contractorRows.length > 0) {
        const runId = await runBulkDomainDiscoveryAsync(contractorRows, {
          autoImportSource: "discovery_bulk_upload",
          campaignType: "contractor",
        });
        runResults.push({ campaign_type: "contractor", run_id: runId, domains_total: contractorRows.length });
      }
      if (jobRows.length > 0) {
        const runId = await runBulkDomainDiscoveryAsync(jobRows, {
          autoImportSource: "discovery_bulk_upload",
          campaignType: "jobs",
        });
        runResults.push({ campaign_type: "jobs", run_id: runId, domains_total: jobRows.length });
      }

      return NextResponse.json({
        ok: true,
        data: {
          run_id: runResults[0]?.run_id ?? null,
          run_ids: runResults,
          domains_total: rows.length,
          parse_stats: stats,
        },
      });
    }

    // JSON body
    const body = (await req.json().catch(() => ({}))) as {
      domains?: string[] | Array<{
        domain: string;
        campaign_type?: "contractor" | "jobs";
        category?: string;
        city?: string;
        state?: string;
        country?: string;
      }>;
    };
    const domainInput = body.domains;
    if (!Array.isArray(domainInput) || domainInput.length === 0) {
      return NextResponse.json({ ok: false, error: "domains_required" }, { status: 400 });
    }

    const normalizedRows = domainInput.map((item) =>
      typeof item === "string"
        ? { domain: item, campaignType: "contractor" as const }
        : {
            domain: item.domain,
            campaignType: item.campaign_type ?? "contractor",
            category: item.category,
            city: item.city,
            state: item.state,
            country: item.country,
            company: (item as { company?: string }).company,
            address: (item as { address?: string }).address,
            firstName: (item as { first_name?: string }).first_name,
            lastName: (item as { last_name?: string }).last_name,
            title: (item as { title?: string }).title,
            email: (item as { email?: string }).email,
            trade: (item as { trade?: string }).trade,
          }
    );

    for (const row of normalizedRows) {
      if (row.campaignType !== "contractor" && row.campaignType !== "jobs") {
        return NextResponse.json({ ok: false, error: "invalid_campaign_type" }, { status: 400 });
      }
    }

    if (shouldUseStructuredImport(normalizedRows)) {
      const summary = await importStructuredLeadRows(normalizedRows, {
        source: "discovery_bulk_import",
      });
      return NextResponse.json({
        ok: true,
        data: summary,
      });
    }

    const contractorRows = normalizedRows.filter((row) => row.campaignType === "contractor");
    const jobRows = normalizedRows.filter((row) => row.campaignType === "jobs");
    const runResults: Array<{ campaign_type: "contractor" | "jobs"; run_id: string; domains_total: number }> = [];

    if (contractorRows.length > 0) {
      const runId = await runBulkDomainDiscoveryAsync(contractorRows, {
        autoImportSource: "discovery_bulk_upload",
        campaignType: "contractor",
      });
      runResults.push({ campaign_type: "contractor", run_id: runId, domains_total: contractorRows.length });
    }
    if (jobRows.length > 0) {
      const runId = await runBulkDomainDiscoveryAsync(jobRows, {
        autoImportSource: "discovery_bulk_upload",
        campaignType: "jobs",
      });
      runResults.push({ campaign_type: "jobs", run_id: runId, domains_total: jobRows.length });
    }

    return NextResponse.json({
      ok: true,
      data: {
        run_id: runResults[0]?.run_id ?? null,
        run_ids: runResults,
        domains_total: domainInput.length,
      },
    });
  } catch (err) {
    console.error("LGS discovery bulk error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "discovery_failed" },
      { status: 500 }
    );
  }
}

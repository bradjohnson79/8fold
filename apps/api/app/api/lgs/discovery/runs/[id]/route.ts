/**
 * LGS: Get discovery run stats and leads.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { discoveryRunLeads, discoveryRuns } from "@/db/schema/directoryEngine";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "run_id_required" }, { status: 400 });
    }

    const [run] = await db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .limit(1);

    if (!run) {
      return NextResponse.json({ ok: false, error: "run_not_found" }, { status: 404 });
    }

    const leads = await db
      .select({
        id: discoveryRunLeads.id,
        email: discoveryRunLeads.email,
        business_name: discoveryRunLeads.businessName,
        contact_name: discoveryRunLeads.contactName,
        industry: discoveryRunLeads.industry,
        domain: discoveryRunLeads.domain,
        verification_score: discoveryRunLeads.verificationScore,
        discovery_method: discoveryRunLeads.discoveryMethod,
        imported: discoveryRunLeads.imported,
      })
      .from(discoveryRunLeads)
      .where(eq(discoveryRunLeads.runId, runId));

    return NextResponse.json({
      ok: true,
      data: {
        run: {
          id: run.id,
          status: run.status ?? "running",
          domains_total: run.domainsTotal ?? 0,
          domains_processed: run.domainsProcessed ?? 0,
          successful_domains: run.successfulDomains ?? 0,
          emails_found: run.emailsFound ?? 0,
          contacts_found: run.contactsFound ?? 0,
          domains_discarded: run.domainsDiscarded ?? 0,
          failed_domains: run.failedDomains ?? 0,
          skipped_domains: run.skippedDomains ?? 0,
          emails_scraped: run.emailsScraped ?? 0,
          emails_pattern_generated: run.emailsPatternGenerated ?? 0,
          emails_verified: run.emailsVerified ?? 0,
          emails_imported: run.emailsImported ?? 0,
          created_at: run.createdAt?.toISOString() ?? null,
        },
        leads,
      },
    });
  } catch (err) {
    console.error("LGS discovery run get error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "get_failed" },
      { status: 500 }
    );
  }
}

/**
 * LGS: Verification-focused view of leads.
 */
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: contractorLeads.id,
        email: contractorLeads.email,
        verification_score: contractorLeads.verificationScore,
        verification_status: contractorLeads.verificationStatus,
        verification_source: contractorLeads.verificationSource,
        domain_reputation: contractorLeads.domainReputation,
        email_bounced: contractorLeads.emailBounced,
        created_at: contractorLeads.createdAt,
      })
      .from(contractorLeads)
      .orderBy(desc(contractorLeads.createdAt))
      .limit(100);

    const data = rows.map((r) => ({
      id: r.id,
      email: r.email,
      verification_score: r.verification_score,
      verification_status: r.verification_status,
      verification_source: r.verification_source,
      domain_reputation: r.domain_reputation,
      email_bounced: r.email_bounced,
      created_at: r.created_at?.toISOString() ?? null,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, data: [] });
    console.error("LGS verification error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

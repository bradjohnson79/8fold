/**
 * LGS: List outreach_messages (GPT-generated for contractor_leads).
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

    const whereClause = status ? eq(outreachMessages.status, status) : undefined;

    const rows = await db
      .select({
        id: outreachMessages.id,
        leadId: outreachMessages.leadId,
        subject: outreachMessages.subject,
        body: outreachMessages.body,
        messageHash: outreachMessages.messageHash,
        generationContext: outreachMessages.generationContext,
        generatedBy: outreachMessages.generatedBy,
        status: outreachMessages.status,
        createdAt: outreachMessages.createdAt,
        leadName: contractorLeads.leadName,
        businessName: contractorLeads.businessName,
        email: contractorLeads.email,
        trade: contractorLeads.trade,
        city: contractorLeads.city,
      })
      .from(outreachMessages)
      .innerJoin(contractorLeads, eq(outreachMessages.leadId, contractorLeads.id))
      .where(whereClause)
      .orderBy(desc(outreachMessages.createdAt))
      .limit(limit);

    const data = rows.map((r) => ({
      id: r.id,
      lead_id: r.leadId,
      subject: r.subject,
      body: r.body,
      message_hash: r.messageHash,
      generation_context: r.generationContext,
      generated_by: r.generatedBy,
      status: r.status,
      created_at: r.createdAt?.toISOString() ?? null,
      lead_name: r.leadName,
      business_name: r.businessName,
      email: r.email,
      trade: r.trade,
      city: r.city,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01") return NextResponse.json({ ok: true, data: [] });
    console.error("LGS messages list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

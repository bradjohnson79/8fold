/**
 * LGS Outreach: List generated messages for review.
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorContacts,
  emailMessages,
} from "@/db/schema/directoryEngine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const approved = searchParams.get("approved");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    const whereClause =
      approved === "true"
        ? eq(emailMessages.approved, true)
        : approved === "false"
          ? eq(emailMessages.approved, false)
          : undefined;

    const rows = await db
      .select({
        id: emailMessages.id,
        contactId: emailMessages.contactId,
        subject: emailMessages.subject,
        body: emailMessages.body,
        hash: emailMessages.hash,
        approved: emailMessages.approved,
        createdAt: emailMessages.createdAt,
        contactName: contractorContacts.name,
        contactEmail: contractorContacts.email,
        contactTrade: contractorContacts.tradeCategory,
        contactLocation: contractorContacts.location,
      })
      .from(emailMessages)
      .innerJoin(contractorContacts, eq(emailMessages.contactId, contractorContacts.id))
      .where(whereClause)
      .orderBy(desc(emailMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error("LGS outreach messages list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

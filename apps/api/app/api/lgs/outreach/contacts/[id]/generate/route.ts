/**
 * LGS Outreach: Generate email for a contact via GPT-5 Nano.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorContacts,
  emailMessages,
} from "@/db/schema/directoryEngine";
import { generateOutreachEmail } from "@/src/services/lgs/outreachEmailGenerationService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contact_id_required" }, { status: 400 });
    }

    const [contact] = await db
      .select()
      .from(contractorContacts)
      .where(eq(contractorContacts.id, contactId))
      .limit(1);

    if (!contact) {
      return NextResponse.json({ ok: false, error: "contact_not_found" }, { status: 404 });
    }

    if (contact.status === "invalid_email") {
      return NextResponse.json({ ok: false, error: "contact_invalid_email" }, { status: 400 });
    }

    const existingHashes = new Set(
      (await db.select({ hash: emailMessages.hash }).from(emailMessages)).map((r) => r.hash)
    );

    const result = await generateOutreachEmail(
      {
        businessName: contact.name ?? "your company",
        trade: contact.tradeCategory ?? "skilled trades",
        city: contact.location ?? "your area",
      },
      existingHashes
    );

    const [inserted] = await db
      .insert(emailMessages)
      .values({
        contactId,
        subject: result.subject,
        body: result.body,
        hash: result.hash,
        approved: false,
      })
      .returning();

    return NextResponse.json({ ok: true, data: inserted });
  } catch (err) {
    console.error("LGS outreach generate error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "generate_failed" },
      { status: 500 }
    );
  }
}

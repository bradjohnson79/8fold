import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, lgsOutreachQueue, outreachMessages } from "@/db/schema/directoryEngine";
import { computeBodyHash } from "./outreachHashService";

type FollowupResult = {
  processed: number;
  generated: number;
  skipped: number;
  paused: number;
  errors: number;
};

const FOLLOWUP_SUBJECT = "Quick follow-up";
const FOLLOWUP_BODY = [
  "Hey - just wanted to follow up in case this got buried.",
  "",
  "Let me know if you're open to hearing more.",
].join("\n");

export async function runFollowupEngine(): Promise<FollowupResult> {
  const result: FollowupResult = { processed: 0, generated: 0, skipped: 0, paused: 0, errors: 0 };
  const now = new Date();

  const dueLeads = await db
    .select({
      id: contractorLeads.id,
      businessName: contractorLeads.businessName,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      followupCount: contractorLeads.followupCount,
      outreachStage: contractorLeads.outreachStage,
      nextFollowupAt: contractorLeads.nextFollowupAt,
      responseReceived: contractorLeads.responseReceived,
      archived: contractorLeads.archived,
      status: contractorLeads.status,
      emailBounced: contractorLeads.emailBounced,
    })
    .from(contractorLeads)
    .where(
      and(
        eq(contractorLeads.outreachStage, "sent"),
        lte(contractorLeads.nextFollowupAt, now),
        sql`${contractorLeads.nextFollowupAt} IS NOT NULL`,
        sql`coalesce(${contractorLeads.followupCount}, 0) = 0`,
        eq(contractorLeads.responseReceived, false),
        eq(contractorLeads.archived, false)
      )
    )
    .limit(50);

  if (dueLeads.length === 0) return result;

  for (const lead of dueLeads) {
    result.processed++;

    try {
      if (lead.archived || lead.status === "archived" || lead.responseReceived || lead.emailBounced) {
        result.skipped++;
        continue;
      }

      const existingFollowup = await db
        .select({ id: outreachMessages.id })
        .from(outreachMessages)
        .where(
          and(
            eq(outreachMessages.leadId, lead.id),
            eq(outreachMessages.messageType, "followup_1")
          )
        )
        .limit(1);

      if (existingFollowup.length > 0) {
        await db
          .update(contractorLeads)
          .set({ nextFollowupAt: null, updatedAt: now })
          .where(eq(contractorLeads.id, lead.id));
        result.skipped++;
        continue;
      }

      const generationContext = {
        business_name: lead.businessName ?? "",
        trade: lead.trade ?? "",
        city: lead.city ?? "",
        message_type: "followup_1",
        followup_count: 1,
      };

      const [inserted] = await db
        .insert(outreachMessages)
        .values({
          leadId: lead.id,
          subject: FOLLOWUP_SUBJECT,
          body: FOLLOWUP_BODY,
          messageHash: computeBodyHash(`${FOLLOWUP_SUBJECT}\n${FOLLOWUP_BODY}\n${lead.id}`),
          generationContext,
          generatedBy: "followup_engine",
          status: "approved",
          messageType: "followup_1",
          messageVersionHash: "followup_1_v1",
        })
        .returning();

      await db.insert(lgsOutreachQueue).values({
        outreachMessageId: inserted.id,
        leadId: lead.id,
        sendStatus: "pending",
        attempts: 0,
      });

      await db
        .update(contractorLeads)
        .set({
          followupCount: 1,
          lastMessageTypeSent: "followup_1",
          nextFollowupAt: null,
          updatedAt: now,
        })
        .where(eq(contractorLeads.id, lead.id));

      result.generated++;
      result.paused++;
    } catch (err) {
      console.error(`[LGS Follow-up] Error processing lead ${lead.id}:`, err);
      result.errors++;
    }
  }

  if (result.generated > 0 || result.errors > 0) {
    console.log(
      `[LGS Follow-up] processed=${result.processed} generated=${result.generated} errors=${result.errors}`
    );
  }

  return result;
}

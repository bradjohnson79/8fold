/**
 * LGS: Bulk approve outreach messages.
 * Accepts { lead_ids: string[] } — approves the latest pending_review message per lead.
 * Accepts { message_ids: string[] } — approves messages directly by id.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
  lgsOutreachQueue,
  outreachMessages,
} from "@/db/schema/directoryEngine";

async function approveMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const [msg] = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "not_found" };
  if (msg.status !== "pending_review") return { ok: false, error: "not_pending_review" };

  const existing = await db
    .select({ id: lgsOutreachQueue.id })
    .from(lgsOutreachQueue)
    .where(eq(lgsOutreachQueue.outreachMessageId, messageId))
    .limit(1);

  if (existing.length > 0) return { ok: false, error: "already_queued" };

  const [lead] = await db
    .select({
      contactAttempts: contractorLeads.contactAttempts,
      archived: contractorLeads.archived,
      status: contractorLeads.status,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, msg.leadId))
    .limit(1);

  if (!lead || lead.archived || lead.status === "archived") {
    return { ok: false, error: "lead_not_sendable" };
  }

  if ((msg.messageType ?? "intro_standard").startsWith("intro") && (lead.contactAttempts ?? 0) > 0) {
    return { ok: false, error: "lead_already_contacted" };
  }

  await db.insert(lgsOutreachQueue).values({
    outreachMessageId: messageId,
    leadId: msg.leadId,
    sendStatus: "pending",
    attempts: 0,
  });

  await db
    .update(outreachMessages)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(outreachMessages.id, messageId));

  return { ok: true };
}

async function approveJobPosterLeadMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const [msg] = await db
    .select()
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "not_found" };
  if (msg.status !== "pending_review") return { ok: false, error: "not_pending_review" };

  const existing = await db
    .select({ id: jobPosterEmailQueue.id })
    .from(jobPosterEmailQueue)
    .where(eq(jobPosterEmailQueue.messageId, messageId))
    .limit(1);

  if (existing.length > 0) return { ok: false, error: "already_queued" };

  const [lead] = await db
    .select({
      contactAttempts: jobPosterLeads.contactAttempts,
      archived: jobPosterLeads.archived,
      status: jobPosterLeads.status,
    })
    .from(jobPosterLeads)
    .where(eq(jobPosterLeads.id, msg.leadId))
    .limit(1);

  if (!lead || lead.archived || lead.status === "archived") {
    return { ok: false, error: "lead_not_sendable" };
  }

  if ((msg.messageType ?? "intro_standard").startsWith("intro") && (lead.contactAttempts ?? 0) > 0) {
    return { ok: false, error: "lead_already_contacted" };
  }

  await db.insert(jobPosterEmailQueue).values({
    messageId,
    senderEmail: "pending_assignment",
    scheduledAt: null,
    status: "pending",
    retryCount: 0,
  });

  await db
    .update(jobPosterEmailMessages)
    .set({ status: "approved", reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobPosterEmailMessages.id, messageId));

  await db
    .update(jobPosterLeads)
    .set({ outreachStatus: "queued", outreachStage: "queued", updatedAt: new Date() })
    .where(eq(jobPosterLeads.id, msg.leadId));

  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      message_ids?: string[];
      lead_ids?: string[];
      lead_type?: "contractor" | "job_poster";
    };
    const leadType = body.lead_type === "job_poster" ? "job_poster" : "contractor";

    let messageIds: string[] = [];

    if (Array.isArray(body.message_ids) && body.message_ids.length > 0) {
      messageIds = body.message_ids.filter(Boolean);
    } else if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      const leadIds = body.lead_ids.filter(Boolean);
      const rows = leadType === "job_poster"
        ? await db
            .select({
              id: jobPosterEmailMessages.id,
              leadId: jobPosterEmailMessages.leadId,
            })
            .from(jobPosterEmailMessages)
            .where(
              and(
                inArray(jobPosterEmailMessages.leadId, leadIds),
                eq(jobPosterEmailMessages.status, "pending_review")
              )
            )
            .orderBy(desc(jobPosterEmailMessages.createdAt))
        : await db
            .select({
              id: outreachMessages.id,
              leadId: outreachMessages.leadId,
            })
            .from(outreachMessages)
            .where(
              and(
                inArray(outreachMessages.leadId, leadIds),
                eq(outreachMessages.status, "pending_review")
              )
            )
            .orderBy(desc(outreachMessages.createdAt));

      // Keep only the latest per lead
      const seenLeads = new Set<string>();
      for (const row of rows) {
        if (!seenLeads.has(row.leadId)) {
          seenLeads.add(row.leadId);
          messageIds.push(row.id);
        }
      }
    }

    if (messageIds.length === 0) {
      return NextResponse.json({ ok: false, error: "no_messages_to_approve" }, { status: 400 });
    }

    let approved = 0;
    let failed = 0;
    const results: Array<{ message_id: string; ok: boolean; error?: string }> = [];

    for (const messageId of messageIds) {
      const r = leadType === "job_poster"
        ? await approveJobPosterLeadMessage(messageId)
        : await approveMessage(messageId);
      results.push({ message_id: messageId, ...r });
      if (r.ok) approved++;
      else failed++;
    }

    return NextResponse.json({ ok: true, data: { approved, failed, results } });
  } catch (err) {
    console.error("LGS messages bulk-approve error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "bulk_approve_failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  lgsOutreachQueue,
  outreachMessages,
  senderPool,
} from "@/db/schema/directoryEngine";
import {
  OUTREACH_ESTIMATED_DELAY_SECONDS,
  loadBrainSettings,
  selectAvailableSender,
} from "@/src/services/lgs/lgsOutreachSchedulerService";
import { normalizeVerificationStatus } from "@/src/services/lgs/simpleEmailVerification";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const limit = Math.min(parseInt(sp.get("limit") ?? "100", 10) || 100, 200);
    const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;

    // ── Queue summary counts ─────────────────────────────────────────────────
    const [summary] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'pending')::int`,
        sent: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'sent')::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${lgsOutreachQueue.sendStatus} = 'failed')::int`,
      })
      .from(lgsOutreachQueue);

    // ── Sender capacity summary ──────────────────────────────────────────────
    const [capacityRow] = await db
      .select({
        totalLimit: sql<number>`COALESCE(SUM(${senderPool.dailyLimit}), 0)::int`,
        totalSent: sql<number>`COALESCE(SUM(${senderPool.outreachSentToday}), 0)::int`,
      })
      .from(senderPool)
      .where(and(eq(senderPool.status, "active"), eq(senderPool.outreachEnabled, true)));

    const sysCapacityUsed = Number(capacityRow?.totalSent ?? 0);
    const sysCapacityTotal = Number(capacityRow?.totalLimit ?? 0);
    const sysCapacityRemaining = Math.max(0, sysCapacityTotal - sysCapacityUsed);
    const predictedSender = sysCapacityRemaining > 0
      ? await selectAvailableSender(await loadBrainSettings(), "contractor")
      : null;

    const whereClause = status ? eq(lgsOutreachQueue.sendStatus, status) : undefined;

    const rows = await db
      .select({
        id: lgsOutreachQueue.id,
        outreachMessageId: lgsOutreachQueue.outreachMessageId,
        leadId: lgsOutreachQueue.leadId,
        priority: lgsOutreachQueue.priority,
        senderAccount: lgsOutreachQueue.senderAccount,
        sendStatus: lgsOutreachQueue.sendStatus,
        sentAt: lgsOutreachQueue.sentAt,
        attempts: lgsOutreachQueue.attempts,
        errorMessage: lgsOutreachQueue.errorMessage,
        createdAt: lgsOutreachQueue.createdAt,
        subject: outreachMessages.subject,
        messageType: outreachMessages.messageType,
        leadEmail: contractorLeads.email,
        businessName: contractorLeads.businessName,
        trade: contractorLeads.trade,
        city: contractorLeads.city,
        verificationStatus: contractorLeads.verificationStatus,
        archived: contractorLeads.archived,
      })
      .from(lgsOutreachQueue)
      .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
      .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
      .where(whereClause)
      .orderBy(asc(lgsOutreachQueue.createdAt))
      .limit(limit)
      .offset(offset);

    let readyIndex = 0;
    const data = rows.map((row) => {
      const reasonCodes: string[] = [];
      const verificationStatus = normalizeVerificationStatus(row.verificationStatus);
      const isPendingVerification = verificationStatus === "pending";
      const isInvalid = verificationStatus === "invalid";
      const isArchived = Boolean(row.archived);

      if (isArchived) {
        reasonCodes.push("blocked_archived");
      } else if (isInvalid) {
        reasonCodes.push("blocked_invalid_email");
      } else if (isPendingVerification) {
        reasonCodes.push("deferred_pending_verification");
      }

      const ready = !isArchived && !isInvalid && !isPendingVerification && sysCapacityRemaining > 0;
      const nextSendAt = ready && row.sendStatus === "pending"
        ? new Date(Date.now() + (readyIndex + 1) * OUTREACH_ESTIMATED_DELAY_SECONDS * 1000).toISOString()
        : null;
      if (ready && row.sendStatus === "pending") {
        readyIndex += 1;
      }

      if (sysCapacityRemaining > 0 && ready) {
        reasonCodes.push("sender_capacity_ok");
      } else if (sysCapacityRemaining === 0) {
        reasonCodes.push("blocked_no_capacity");
      }

      return {
        id: row.id,
        lead_id: row.leadId,
        outreach_message_id: row.outreachMessageId,
        sender_account: row.senderAccount,
        display_sender_account: row.senderAccount ?? (row.sendStatus === "pending" ? predictedSender?.senderEmail ?? null : null),
        send_status: row.sendStatus,
        sent_at: row.sentAt?.toISOString() ?? null,
        attempts: row.attempts ?? 0,
        error_message: row.errorMessage,
        created_at: row.createdAt?.toISOString() ?? null,
        next_send_at: nextSendAt,
        subject: row.subject,
        message_type: row.messageType ?? "intro_standard",
        lead_email: row.leadEmail,
        business_name: row.businessName,
        trade: row.trade,
        city: row.city,
        verification_status: verificationStatus,
        archived: isArchived,
        reason_codes: reasonCodes,
        is_ready: ready && row.sendStatus === "pending",
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        pending: Number(summary?.pending ?? 0),
        sent: Number(summary?.sent ?? 0),
        failed: Number(summary?.failed ?? 0),
        capacity_used: sysCapacityUsed,
        capacity_total: sysCapacityTotal,
        capacity_remaining: sysCapacityRemaining,
      },
      data,
    });
  } catch (err) {
    console.error("LGS queue list error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

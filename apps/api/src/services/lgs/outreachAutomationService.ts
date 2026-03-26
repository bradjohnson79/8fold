import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
  lgsOutreachQueue,
  outreachMessages,
} from "@/db/schema/directoryEngine";
import { generateJobPosterMessage } from "./jobPosterMessageGenerationService";
import { generateOutreachEmail } from "./outreachEmailGenerationService";

type OutreachStatus =
  | "pending"
  | "message_generated"
  | "approved"
  | "queued"
  | "sent"
  | "failed";

function now() {
  return new Date();
}

function priorityForLead(priority: string | null | undefined): number {
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function isLeadMessageType(messageType: string | null | undefined): boolean {
  const normalized = String(messageType ?? "intro_standard").trim().toLowerCase();
  if (!normalized) return true;
  if (["warmup", "test", "internal", "seed"].some((marker) => normalized.includes(marker))) return false;
  return normalized.startsWith("intro") || normalized.startsWith("followup");
}

function stageForOutreachStatus(status: OutreachStatus): string | undefined {
  if (status === "message_generated" || status === "approved") return "message_ready";
  if (status === "queued") return "queued";
  if (status === "sent") return "sent";
  return undefined;
}

export function deriveLeadOutreachStatus(messageStatus: string | null | undefined, queueStatus?: string | null): OutreachStatus {
  if (queueStatus === "sent") return "sent";
  if (queueStatus === "pending") return "queued";
  if (queueStatus === "failed") return "failed";

  if (messageStatus === "sent") return "sent";
  if (messageStatus === "queued") return "queued";
  if (messageStatus === "approved") return "approved";
  if (messageStatus === "pending_review" || messageStatus === "draft") return "message_generated";
  if (messageStatus === "failed") return "failed";
  return "pending";
}

async function syncContractorLeadOutreachStatus(leadId: string, status: OutreachStatus, messageType?: string | null): Promise<void> {
  const patch: Partial<typeof contractorLeads.$inferInsert> = {
    outreachStatus: status,
    updatedAt: now(),
  };
  const stage = stageForOutreachStatus(status);
  if (stage) patch.outreachStage = stage;
  if (messageType) patch.lastMessageTypeSent = messageType;
  await db.update(contractorLeads).set(patch).where(eq(contractorLeads.id, leadId));
}

async function syncJobLeadOutreachStatus(leadId: string, status: OutreachStatus): Promise<void> {
  const patch: Partial<typeof jobPosterLeads.$inferInsert> = {
    outreachStatus: status,
    updatedAt: now(),
  };
  const stage = stageForOutreachStatus(status);
  if (stage) patch.outreachStage = stage;
  await db.update(jobPosterLeads).set(patch).where(eq(jobPosterLeads.id, leadId));
}

async function getContractorExistingMessage(leadId: string) {
  const [message] = await db
    .select({
      id: outreachMessages.id,
      status: outreachMessages.status,
      messageType: outreachMessages.messageType,
    })
    .from(outreachMessages)
    .where(eq(outreachMessages.leadId, leadId))
    .orderBy(desc(outreachMessages.createdAt))
    .limit(1);

  if (!message) return null;

  const [queue] = await db
    .select({ status: lgsOutreachQueue.sendStatus })
    .from(lgsOutreachQueue)
    .where(eq(lgsOutreachQueue.outreachMessageId, message.id))
    .limit(1);

  return { ...message, queueStatus: queue?.status ?? null };
}

async function getJobExistingMessage(leadId: string) {
  const [message] = await db
    .select({
      id: jobPosterEmailMessages.id,
      status: jobPosterEmailMessages.status,
    })
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.leadId, leadId))
    .orderBy(desc(jobPosterEmailMessages.createdAt))
    .limit(1);

  if (!message) return null;

  const [queue] = await db
    .select({ status: jobPosterEmailQueue.status })
    .from(jobPosterEmailQueue)
    .where(eq(jobPosterEmailQueue.messageId, message.id))
    .limit(1);

  return { ...message, queueStatus: queue?.status ?? null };
}

export async function generateContractorMessageForLead(
  leadId: string,
  existingHashes: Set<string>,
  skipIfExists = true
): Promise<{ ok: boolean; skipped?: boolean; id?: string; error?: string; outreach_status?: OutreachStatus }> {
  const [lead] = await db
    .select({
      id: contractorLeads.id,
      leadName: contractorLeads.leadName,
      businessName: contractorLeads.businessName,
      email: contractorLeads.email,
      trade: contractorLeads.trade,
      city: contractorLeads.city,
      state: contractorLeads.state,
      source: contractorLeads.source,
      leadPriority: contractorLeads.leadPriority,
      followupCount: contractorLeads.followupCount,
      lastMessageTypeSent: contractorLeads.lastMessageTypeSent,
      outreachStatus: contractorLeads.outreachStatus,
    })
    .from(contractorLeads)
    .where(eq(contractorLeads.id, leadId))
    .limit(1);

  if (!lead) return { ok: false, error: "lead_not_found" };
  if (!lead.email?.trim()) return { ok: false, error: "lead_email_required" };

  if (skipIfExists) {
    const existing = await getContractorExistingMessage(leadId);
    if (existing) {
      const synced = deriveLeadOutreachStatus(existing.status, existing.queueStatus);
      if (lead.outreachStatus !== synced) {
        await syncContractorLeadOutreachStatus(leadId, synced, existing.messageType);
      }
      if (synced !== "pending") {
        return { ok: true, skipped: true, id: existing.id, outreach_status: synced };
      }
    }
  }

  const result = await generateOutreachEmail(
    {
      businessName: lead.businessName ?? "",
      trade: lead.trade ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      contactName: lead.leadName ?? undefined,
      leadPriority: lead.leadPriority ?? "medium",
      followupCount: lead.followupCount ?? 0,
      lastMessageTypeSent: lead.lastMessageTypeSent,
    },
    existingHashes
  );

  existingHashes.add(result.hash);

  const generationContext = {
    business_name: lead.businessName ?? "",
    trade: lead.trade ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    source: lead.source ?? "",
    message_type: result.messageType,
  };

  const [inserted] = await db
    .insert(outreachMessages)
    .values({
      leadId,
      subject: result.subject,
      body: result.body,
      messageHash: result.hash,
      generationContext,
      generatedBy: "gpt5-nano",
      status: "pending_review",
      messageType: result.messageType,
      messageVersionHash: result.messageVersionHash,
    })
    .returning({ id: outreachMessages.id });

  await syncContractorLeadOutreachStatus(leadId, "message_generated", result.messageType);

  console.log("[Outreach] Message generated", { pipeline: "contractor", leadId, messageId: inserted?.id });
  return { ok: true, id: inserted?.id, outreach_status: "message_generated" };
}

export async function generateJobPosterMessageForLead(
  leadId: string
): Promise<{ ok: boolean; skipped?: boolean; id?: string; error?: string; outreach_status?: OutreachStatus }> {
  const [lead] = await db
    .select({
      id: jobPosterLeads.id,
      campaignId: jobPosterLeads.campaignId,
      companyName: jobPosterLeads.companyName,
      contactName: jobPosterLeads.contactName,
      email: jobPosterLeads.email,
      city: jobPosterLeads.city,
      category: jobPosterLeads.category,
      outreachStatus: jobPosterLeads.outreachStatus,
    })
    .from(jobPosterLeads)
    .where(eq(jobPosterLeads.id, leadId))
    .limit(1);

  if (!lead) return { ok: false, error: "lead_not_found" };
  if (!lead.email?.trim()) return { ok: false, error: "lead_email_required" };
  if (!lead.campaignId) return { ok: false, error: "campaign_id_required" };

  const existing = await getJobExistingMessage(leadId);
  if (existing) {
    const synced = deriveLeadOutreachStatus(existing.status, existing.queueStatus);
    if (lead.outreachStatus !== synced) {
      await syncJobLeadOutreachStatus(leadId, synced);
    }
    if (synced !== "pending") {
      return { ok: true, skipped: true, id: existing.id, outreach_status: synced };
    }
  }

  const generated = generateJobPosterMessage({
    companyName: lead.companyName,
    contactName: lead.contactName,
    city: lead.city,
    category: lead.category,
  });

  const [inserted] = await db
    .insert(jobPosterEmailMessages)
    .values({
      campaignId: lead.campaignId,
      leadId: lead.id,
      subject: generated.subject,
      body: generated.body,
      messageHash: generated.hash,
      generationContext: {
        campaign_type: "jobs",
        city: lead.city,
        category: lead.category,
      },
      generatedBy: "template",
      status: "draft",
      messageType: "intro_standard",
      messageVersionHash: generated.hash.slice(0, 16),
      updatedAt: now(),
    })
    .returning({ id: jobPosterEmailMessages.id });

  await syncJobLeadOutreachStatus(leadId, "message_generated");

  console.log("[Outreach] Message generated", { pipeline: "jobs", leadId, messageId: inserted?.id });
  return { ok: true, id: inserted?.id, outreach_status: "message_generated" };
}

export async function approveContractorMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  const [msg] = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "message_not_found" };
  if (msg.status !== "pending_review") return { ok: false, error: "message_not_pending_review" };

  await db
    .update(outreachMessages)
    .set({
      status: "approved",
      reviewedAt: now(),
    })
    .where(eq(outreachMessages.id, messageId));

  await syncContractorLeadOutreachStatus(msg.leadId, "approved", msg.messageType);
  console.log("[Outreach] Approved", { pipeline: "contractor", messageId, leadId: msg.leadId });
  return { ok: true, leadId: msg.leadId };
}

export async function approveJobPosterMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  const [message] = await db
    .select()
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.id, messageId))
    .limit(1);

  if (!message) return { ok: false, error: "message_not_found" };
  if (message.status !== "draft") return { ok: false, error: "message_not_draft" };

  await db
    .update(jobPosterEmailMessages)
    .set({ status: "approved", reviewedAt: now(), updatedAt: now() })
    .where(eq(jobPosterEmailMessages.id, messageId));

  await syncJobLeadOutreachStatus(message.leadId, "approved");
  console.log("[Outreach] Approved", { pipeline: "jobs", messageId, leadId: message.leadId });
  return { ok: true, leadId: message.leadId };
}

export async function rejectContractorMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  const [msg] = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId))
    .limit(1);

  if (!msg) return { ok: false, error: "message_not_found" };

  await db
    .update(outreachMessages)
    .set({
      status: "rejected",
      reviewedAt: now(),
    })
    .where(eq(outreachMessages.id, messageId));

  await syncContractorLeadOutreachStatus(msg.leadId, "pending", msg.messageType);
  return { ok: true, leadId: msg.leadId };
}

export async function rejectJobPosterMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  const [message] = await db
    .select()
    .from(jobPosterEmailMessages)
    .where(eq(jobPosterEmailMessages.id, messageId))
    .limit(1);

  if (!message) return { ok: false, error: "message_not_found" };
  if (message.status === "sent") return { ok: false, error: "message_already_sent" };

  await db
    .update(jobPosterEmailMessages)
    .set({ status: "rejected", reviewedAt: now(), updatedAt: now() })
    .where(eq(jobPosterEmailMessages.id, messageId));

  await syncJobLeadOutreachStatus(message.leadId, "pending");
  return { ok: true, leadId: message.leadId };
}

export async function queueApprovedContractorMessages(limit = 200): Promise<{ queued: number; skipped: number }> {
  const approvedMessages = await db
    .select({
      id: outreachMessages.id,
      leadId: outreachMessages.leadId,
      leadPriority: contractorLeads.leadPriority,
      messageType: outreachMessages.messageType,
      verificationStatus: contractorLeads.verificationStatus,
      archived: contractorLeads.archived,
      emailBounced: contractorLeads.emailBounced,
      email: contractorLeads.email,
    })
    .from(outreachMessages)
    .innerJoin(contractorLeads, eq(outreachMessages.leadId, contractorLeads.id))
    .where(
      and(
        eq(outreachMessages.status, "approved"),
        eq(contractorLeads.outreachStatus, "approved")
      )
    )
    .orderBy(desc(outreachMessages.createdAt))
    .limit(limit);

  if (approvedMessages.length === 0) {
    return { queued: 0, skipped: 0 };
  }

  const existingQueueRows = await db
    .select({ messageId: lgsOutreachQueue.outreachMessageId })
    .from(lgsOutreachQueue)
    .where(inArray(lgsOutreachQueue.outreachMessageId, approvedMessages.map((message) => message.id)));

  const queuedSet = new Set(existingQueueRows.map((row) => row.messageId));
  const queueableMessages = approvedMessages.filter((message) => {
    if (queuedSet.has(message.id)) return false;
    if (!isLeadMessageType(message.messageType)) return false;
    if (message.archived || message.emailBounced) return false;
    if (!message.email || !message.email.trim()) return false;
    const verification = String(message.verificationStatus ?? "").trim().toLowerCase();
    return verification === "valid" || verification === "verified";
  });

  if (queueableMessages.length > 0) {
    await db.insert(lgsOutreachQueue).values(
      queueableMessages.map((message) => ({
        outreachMessageId: message.id,
        leadId: message.leadId,
        priority: priorityForLead(message.leadPriority),
        sendStatus: "pending",
        attempts: 0,
      }))
    );

    const messageIds = queueableMessages.map((message) => message.id);
    const leadIds = queueableMessages.map((message) => message.leadId);

    await db
      .update(outreachMessages)
      .set({ status: "queued", reviewedAt: now() })
      .where(inArray(outreachMessages.id, messageIds));

    await db
      .update(contractorLeads)
      .set({ outreachStatus: "queued", outreachStage: "queued", updatedAt: now() })
      .where(inArray(contractorLeads.id, leadIds));
  }

  if (queueableMessages.length > 0) {
    console.log("[Outreach] Queued", { pipeline: "contractor", queued: queueableMessages.length });
  }

  return {
    queued: queueableMessages.length,
    skipped: approvedMessages.length - queueableMessages.length,
  };
}

export async function queueApprovedJobPosterMessages(campaignId?: string): Promise<{ queued: number; skipped: number }> {
  const conditions = [eq(jobPosterEmailMessages.status, "approved")];
  if (campaignId) {
    conditions.push(eq(jobPosterEmailMessages.campaignId, campaignId));
  }

  const approvedMessages = await db
    .select({
      id: jobPosterEmailMessages.id,
      leadId: jobPosterEmailMessages.leadId,
      campaignId: jobPosterEmailMessages.campaignId,
      messageType: jobPosterEmailMessages.messageType,
      emailVerificationStatus: jobPosterLeads.emailVerificationStatus,
      archived: jobPosterLeads.archived,
      emailBounced: jobPosterLeads.emailBounced,
      email: jobPosterLeads.email,
    })
    .from(jobPosterEmailMessages)
    .innerJoin(jobPosterLeads, eq(jobPosterEmailMessages.leadId, jobPosterLeads.id))
    .where(and(...conditions));

  if (approvedMessages.length === 0) {
    return { queued: 0, skipped: 0 };
  }

  const existingQueueRows = await db
    .select({ messageId: jobPosterEmailQueue.messageId })
    .from(jobPosterEmailQueue)
    .where(inArray(jobPosterEmailQueue.messageId, approvedMessages.map((message) => message.id)));
  const queuedSet = new Set(existingQueueRows.map((row) => row.messageId));
  const queueableMessages = approvedMessages.filter((message) => {
    if (queuedSet.has(message.id)) return false;
    if (!isLeadMessageType(message.messageType)) return false;
    if (message.archived || message.emailBounced) return false;
    if (!message.email || !message.email.trim()) return false;
    const verification = String(message.emailVerificationStatus ?? "").trim().toLowerCase();
    return verification === "valid" || verification === "verified";
  });

  if (queueableMessages.length > 0) {
    await db.insert(jobPosterEmailQueue).values(
      queueableMessages.map((message) => ({
        messageId: message.id,
        senderEmail: "pending_assignment",
        scheduledAt: null,
        status: "pending",
        retryCount: 0,
      }))
    );

    const messageIds = queueableMessages.map((message) => message.id);
    const leadIds = queueableMessages.map((message) => message.leadId);

    await db
      .update(jobPosterEmailMessages)
      .set({ status: "queued", updatedAt: now() })
      .where(inArray(jobPosterEmailMessages.id, messageIds));

    await db
      .update(jobPosterLeads)
      .set({ outreachStatus: "queued", outreachStage: "queued", updatedAt: now() })
      .where(inArray(jobPosterLeads.id, leadIds));
  }

  if (queueableMessages.length > 0) {
    console.log("[Outreach] Queued", { pipeline: "jobs", queued: queueableMessages.length, campaignId: campaignId ?? null });
  }

  return {
    queued: queueableMessages.length,
    skipped: approvedMessages.length - queueableMessages.length,
  };
}

export async function generateContractorMessagesForAssignedLeads(limit = 50): Promise<{ generated: number; skipped: number; failed: number }> {
  const leads = await db
    .select({ id: contractorLeads.id })
    .from(contractorLeads)
    .where(
      and(
        eq(contractorLeads.assignmentStatus, "assigned"),
        eq(contractorLeads.outreachStatus, "pending"),
        eq(contractorLeads.archived, false),
        sql`coalesce(${contractorLeads.emailBounced}, false) = false`,
        sql`${contractorLeads.email} is not null and trim(${contractorLeads.email}) <> ''`
      )
    )
    .limit(limit);

  if (leads.length === 0) return { generated: 0, skipped: 0, failed: 0 };

  const existingHashes = new Set(
    (
      await db.select({ hash: outreachMessages.messageHash }).from(outreachMessages)
    )
      .map((r) => r.hash ?? "")
      .filter(Boolean)
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  for (const lead of leads) {
    try {
      const result = await generateContractorMessageForLead(lead.id, existingHashes, true);
      if (result.skipped) skipped++;
      else if (result.ok) generated++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { generated, skipped, failed };
}

export async function generateJobPosterMessagesForAssignedLeads(limit = 50): Promise<{ generated: number; skipped: number; failed: number }> {
  const leads = await db
    .select({ id: jobPosterLeads.id })
    .from(jobPosterLeads)
    .where(
      and(
        eq(jobPosterLeads.assignmentStatus, "assigned"),
        eq(jobPosterLeads.outreachStatus, "pending"),
        eq(jobPosterLeads.archived, false),
        sql`coalesce(${jobPosterLeads.emailBounced}, false) = false`,
        sql`${jobPosterLeads.email} is not null and trim(${jobPosterLeads.email}) <> ''`,
        sql`${jobPosterLeads.campaignId} is not null`
      )
    )
    .limit(limit);

  if (leads.length === 0) return { generated: 0, skipped: 0, failed: 0 };

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  for (const lead of leads) {
    try {
      const result = await generateJobPosterMessageForLead(lead.id);
      if (result.skipped) skipped++;
      else if (result.ok) generated++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { generated, skipped, failed };
}

export async function runOutreachAutomationCycle(): Promise<{
  contractor: { generated: number; skipped_generation: number; failed_generation: number; queued: number; skipped_queue: number };
  jobs: { generated: number; skipped_generation: number; failed_generation: number; queued: number; skipped_queue: number };
}> {
  const contractorGenerated = await generateContractorMessagesForAssignedLeads();
  const jobsGenerated = await generateJobPosterMessagesForAssignedLeads();
  const contractorQueued = await queueApprovedContractorMessages();
  const jobsQueued = await queueApprovedJobPosterMessages();

  return {
    contractor: {
      generated: contractorGenerated.generated,
      skipped_generation: contractorGenerated.skipped,
      failed_generation: contractorGenerated.failed,
      queued: contractorQueued.queued,
      skipped_queue: contractorQueued.skipped,
    },
    jobs: {
      generated: jobsGenerated.generated,
      skipped_generation: jobsGenerated.skipped,
      failed_generation: jobsGenerated.failed,
      queued: jobsQueued.queued,
      skipped_queue: jobsQueued.skipped,
    },
  };
}

export async function getCampaignOutreachMetrics(campaignIds: string[]): Promise<Record<string, {
  generated: number;
  approved: number;
  queued: number;
  sent: number;
  failed: number;
}>> {
  if (campaignIds.length === 0) return {};

  const contractorRows = await db
    .select({
      campaignId: contractorLeads.campaignId,
      outreachStatus: contractorLeads.outreachStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(contractorLeads)
    .where(
      and(
        inArray(contractorLeads.campaignId, campaignIds),
        sql`${contractorLeads.campaignId} is not null`
      )
    )
    .groupBy(contractorLeads.campaignId, contractorLeads.outreachStatus);

  const jobRows = await db
    .select({
      campaignId: jobPosterLeads.campaignId,
      outreachStatus: jobPosterLeads.outreachStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(jobPosterLeads)
    .where(
      and(
        inArray(jobPosterLeads.campaignId, campaignIds),
        sql`${jobPosterLeads.campaignId} is not null`
      )
    )
    .groupBy(jobPosterLeads.campaignId, jobPosterLeads.outreachStatus);

  const metrics: Record<string, { generated: number; approved: number; queued: number; sent: number; failed: number }> = {};
  const upsert = (campaignId: string | null, outreachStatus: string | null, count: number) => {
    if (!campaignId) return;
    if (!metrics[campaignId]) {
      metrics[campaignId] = { generated: 0, approved: 0, queued: 0, sent: 0, failed: 0 };
    }
    if (outreachStatus === "message_generated") metrics[campaignId].generated += count;
    if (outreachStatus === "approved") metrics[campaignId].approved += count;
    if (outreachStatus === "queued") metrics[campaignId].queued += count;
    if (outreachStatus === "sent") metrics[campaignId].sent += count;
    if (outreachStatus === "failed") metrics[campaignId].failed += count;
  };

  for (const row of contractorRows) upsert(row.campaignId, row.outreachStatus, Number(row.count ?? 0));
  for (const row of jobRows) upsert(row.campaignId, row.outreachStatus, Number(row.count ?? 0));
  return metrics;
}

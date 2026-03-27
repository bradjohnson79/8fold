import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
  leadFinderCampaigns,
} from "@/db/schema/directoryEngine";
import {
  getCompanyDomain,
  incrementOutreachCounter,
  isDomainOnCooldown,
  isLeadMessageType,
  loadBrainSettings,
  selectAvailableSender,
  sendWithRetry,
  triggerBounceCooldown,
} from "./lgsOutreachSchedulerService";
import { queueApprovedJobPosterMessages as queueApprovedJobPosterMessagesForAutomation } from "./outreachAutomationService";
import { syncCampaignDomainReplyRate } from "./priorityScoringService";

type QueueCycleResult = {
  processed: number;
  sent: number;
  failed: number;
  blockedReason?: "outside_send_window";
  nextSendWindow?: Date;
};

type JobPosterQueuedItem = {
  queueId: string;
  messageId: string;
  leadId: string;
  campaignId: string | null;
  subject: string;
  body: string;
  generationContext: unknown;
  email: string;
  website: string | null;
  senderId: string;
  senderEmail: string;
};

type JobPosterQueueFetchResult =
  | {
      settings: Awaited<ReturnType<typeof loadBrainSettings>>;
      item: JobPosterQueuedItem;
      blockedReason?: undefined;
      nextSendWindow?: undefined;
    }
  | {
      settings: Awaited<ReturnType<typeof loadBrainSettings>>;
      item: null;
      blockedReason?: "outside_send_window";
      nextSendWindow?: Date;
    };

function mergeOutboundMetadata(
  current: unknown,
  metadata: {
    senderAccount: string;
    gmailMessageId: string | null;
    gmailThreadId: string | null;
    rfcMessageId: string;
    sentAt: string;
  },
): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  const existingOutbound = base.outbound && typeof base.outbound === "object" && !Array.isArray(base.outbound)
    ? base.outbound as Record<string, unknown>
    : {};

  return {
    ...base,
    outbound: {
      ...existingOutbound,
      senderAccount: metadata.senderAccount,
      gmailMessageId: metadata.gmailMessageId,
      gmailThreadId: metadata.gmailThreadId,
      rfcMessageId: metadata.rfcMessageId,
      sentAt: metadata.sentAt,
    },
  };
}

async function fetchNextQueuedJobPosterMessage(allowRefill = true): Promise<JobPosterQueueFetchResult> {
  const settings = await loadBrainSettings();
  return fetchNextQueuedJobPosterMessageWithSenderPreference(undefined, allowRefill, settings);
}

async function fetchNextQueuedJobPosterMessageWithSenderPreference(
  preferredSenderEmail?: string | null,
  allowRefill = true,
  settingsOverride?: Awaited<ReturnType<typeof loadBrainSettings>>,
): Promise<JobPosterQueueFetchResult> {
  const settings = settingsOverride ?? await loadBrainSettings();
  const sender = await selectAvailableSender(settings, "jobs", preferredSenderEmail);
  if (!sender) {
    return { settings, item: null };
  }
  if ("blocked" in sender) {
    return {
      settings,
      item: null,
      blockedReason: sender.reason,
      nextSendWindow: sender.nextSendWindow,
    };
  }

  const rows = await db
    .select({
      queueId: jobPosterEmailQueue.id,
      messageId: jobPosterEmailMessages.id,
      leadId: jobPosterLeads.id,
      campaignId: jobPosterEmailMessages.campaignId,
      subject: jobPosterEmailMessages.subject,
      body: jobPosterEmailMessages.body,
      messageType: jobPosterEmailMessages.messageType,
      generationContext: jobPosterEmailMessages.generationContext,
      messageStatus: jobPosterEmailMessages.status,
      email: jobPosterLeads.email,
      website: jobPosterLeads.website,
      city: jobPosterLeads.city,
      category: jobPosterLeads.category,
      outreachStage: jobPosterLeads.outreachStage,
      leadScore: jobPosterLeads.leadScore,
      leadPriority: jobPosterLeads.leadPriority,
      priorityScore: jobPosterLeads.priorityScore,
      replyCount: jobPosterLeads.replyCount,
      emailVerificationStatus: jobPosterLeads.emailVerificationStatus,
      emailBounced: jobPosterLeads.emailBounced,
      archived: jobPosterLeads.archived,
      scheduledAt: jobPosterEmailQueue.scheduledAt,
    })
    .from(jobPosterEmailQueue)
    .innerJoin(jobPosterEmailMessages, eq(jobPosterEmailQueue.messageId, jobPosterEmailMessages.id))
    .innerJoin(jobPosterLeads, eq(jobPosterEmailMessages.leadId, jobPosterLeads.id))
    .where(eq(jobPosterEmailQueue.status, "pending"))
    .orderBy(
      asc(
        sql`CASE
          WHEN lower(coalesce(${jobPosterLeads.emailVerificationStatus}, 'pending')) IN ('valid', 'verified') THEN 0
          WHEN lower(coalesce(${jobPosterLeads.emailVerificationStatus}, 'pending')) = 'invalid' THEN 2
          ELSE 1
        END`
      ),
      asc(jobPosterLeads.createdAt),
      asc(jobPosterEmailQueue.createdAt)
    )
    .limit(100)
    .for("update", { skipLocked: true });

  const now = new Date();
  for (const row of rows) {
    if (!row.subject || !row.body || !row.email) continue;
    if (row.messageStatus !== "approved" && row.messageStatus !== "queued") continue;
    if (!isLeadMessageType(row.messageType)) continue;
    if (row.emailBounced) continue;
    if (row.archived) continue;
    const verificationStatus = String(row.emailVerificationStatus ?? "").trim().toLowerCase();
    const isInvalid = verificationStatus === "invalid";
    const isValid = verificationStatus === "valid" || verificationStatus === "verified";
    if (isInvalid || !isValid) continue;
    if (row.scheduledAt && new Date(row.scheduledAt) > now) continue;

    const blockedStages = ["replied", "converted", "paused", "archived"];
    if (row.outreachStage && blockedStages.includes(row.outreachStage)) continue;
    const domain = getCompanyDomain(row.website, row.email);
    if (domain) {
      const onCooldown = await isDomainOnCooldown(domain, settings.domainCooldownDays, row.leadId, "jobs");
      if (onCooldown) continue;
    }

    return {
      settings,
      item: {
        queueId: row.queueId,
        messageId: row.messageId,
        leadId: row.leadId,
        campaignId: row.campaignId,
        subject: row.subject,
        body: row.body,
        generationContext: row.generationContext,
        email: row.email.trim().toLowerCase(),
        website: row.website,
        senderId: sender.id,
        senderEmail: sender.senderEmail,
      },
    };
  }

  if (allowRefill) {
    const refill = await queueApprovedJobPosterMessagesForAutomation();
    if (refill.queued > 0) {
      return fetchNextQueuedJobPosterMessageWithSenderPreference(preferredSenderEmail, false, settings);
    }
  }

  return { settings, item: null };
}

export async function runJobPosterQueueCycle(): Promise<QueueCycleResult> {
  return runJobPosterQueueCycleWithOptions();
}

export async function runJobPosterQueueCycleWithOptions(opts?: {
  preferredSenderEmail?: string | null;
}): Promise<QueueCycleResult> {
  console.log("[Job Poster] Processing queue...");

  const { item, blockedReason, nextSendWindow } = await fetchNextQueuedJobPosterMessageWithSenderPreference(
    opts?.preferredSenderEmail,
  );
  if (!item) {
    return { processed: 0, sent: 0, failed: 0, blockedReason, nextSendWindow };
  }

  const result = await sendWithRetry({
    subject: item.subject,
    body: item.body,
    contactEmail: item.email,
    senderAccount: item.senderEmail,
  });

  const now = new Date();
  if (result.ok) {
    await db
      .update(jobPosterEmailQueue)
      .set({
        senderEmail: item.senderEmail,
        status: "sent",
        sentAt: now,
        retryCount: sql`${jobPosterEmailQueue.retryCount} + 1`,
        errorMessage: null,
      })
      .where(eq(jobPosterEmailQueue.id, item.queueId));

    await db
      .update(jobPosterEmailMessages)
      .set({
        status: "sent",
        updatedAt: now,
        reviewedAt: now,
        generationContext: mergeOutboundMetadata(item.generationContext, {
          senderAccount: item.senderEmail,
          gmailMessageId: result.gmailMessageId,
          gmailThreadId: result.gmailThreadId,
          rfcMessageId: result.rfcMessageId,
          sentAt: now.toISOString(),
        }),
      })
      .where(eq(jobPosterEmailMessages.id, item.messageId));

    await db
      .update(jobPosterLeads)
      .set({
        contactAttempts: sql`${jobPosterLeads.contactAttempts} + 1`,
        status: "sent",
        outreachStatus: "sent",
        outreachStage: "sent",
        lastContactedAt: now,
        updatedAt: now,
      })
      .where(eq(jobPosterLeads.id, item.leadId));

    if (item.campaignId) {
      await db
        .update(leadFinderCampaigns)
        .set({ sentCount: sql`${leadFinderCampaigns.sentCount} + 1` })
        .where(eq(leadFinderCampaigns.id, item.campaignId));
        await syncCampaignDomainReplyRate({
          pipeline: "jobs",
          campaignId: item.campaignId,
          website: item.website,
        });
    }

    await incrementOutreachCounter(item.senderId);
    console.log("[Job Poster] Queue item sent", {
      queueId: item.queueId,
      leadId: item.leadId,
      campaignId: item.campaignId,
      senderEmail: item.senderEmail,
    });
    return { processed: 1, sent: 1, failed: 0 };
  }

  const updateQueue = {
    senderEmail: item.senderEmail,
    status: "failed" as const,
    retryCount: sql`${jobPosterEmailQueue.retryCount} + 1`,
    errorMessage: result.message,
    sentAt: result.bounce ? now : null,
  };

  await db
    .update(jobPosterEmailQueue)
    .set(updateQueue)
    .where(eq(jobPosterEmailQueue.id, item.queueId));

  await db
    .update(jobPosterEmailMessages)
    .set({
      status: "failed",
      updatedAt: now,
      reviewedAt: now,
      generationContext: mergeOutboundMetadata(item.generationContext, {
        senderAccount: item.senderEmail,
        gmailMessageId: null,
        gmailThreadId: null,
        rfcMessageId: "send_failed",
        sentAt: now.toISOString(),
      }),
    })
    .where(eq(jobPosterEmailMessages.id, item.messageId));

  await db
    .update(jobPosterLeads)
    .set({
      outreachStatus: "failed",
      updatedAt: now,
    })
    .where(eq(jobPosterLeads.id, item.leadId));

  if (result.bounce) {
    await db
      .update(jobPosterLeads)
      .set({
        emailBounced: true,
        bounceReason: result.message,
        status: "failed",
        outreachStatus: "failed",
        updatedAt: now,
      })
      .where(eq(jobPosterLeads.id, item.leadId));

    if (item.campaignId) {
      await db
        .update(leadFinderCampaigns)
        .set({ bounceCount: sql`${leadFinderCampaigns.bounceCount} + 1` })
        .where(eq(leadFinderCampaigns.id, item.campaignId));
    }

    const { exceeded, rate } = await (async () => {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
          bounced: sql<number>`count(*) filter (where ${jobPosterEmailQueue.errorMessage} is not null and ${jobPosterEmailQueue.errorMessage} ~* 'bounce|550|rejected|permanent')::int`,
        })
        .from(jobPosterEmailQueue)
        .where(eq(jobPosterEmailQueue.senderEmail, item.senderEmail))
        .limit(1);
      const total = Number(row?.total ?? 0);
      const bounced = Number(row?.bounced ?? 0);
      const rate = total > 0 ? bounced / total : 0;
      return { exceeded: total >= 20 && rate > 0.05, rate };
    })();

    if (exceeded) {
      await triggerBounceCooldown(item.senderId, item.senderEmail, rate);
    }
  }

  console.warn("[Job Poster] Queue item failed", {
    queueId: item.queueId,
    leadId: item.leadId,
    campaignId: item.campaignId,
    senderEmail: item.senderEmail,
    bounce: result.bounce,
    message: result.message,
  });
  return { processed: 1, sent: 0, failed: 1 };
}

export async function queueApprovedJobPosterMessages(campaignId: string): Promise<{ queued: number; skipped: number }> {
  return queueApprovedJobPosterMessagesForAutomation(campaignId);
}

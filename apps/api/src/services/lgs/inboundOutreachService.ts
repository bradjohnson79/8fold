import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorLeads,
  jobPosterEmailMessages,
  jobPosterEmailQueue,
  jobPosterLeads,
  leadFinderCampaigns,
  lgsInboundEvents,
  lgsOutreachQueue,
  outreachMessages,
} from "@/db/schema/directoryEngine";
import {
  scoreAndSaveContractorLead,
  scoreAndSaveJobPosterLead,
  syncCampaignDomainReplyRate,
} from "./priorityScoringService";

export type OutreachCampaignType = "contractor" | "jobs";
export type InboundEventType = "reply" | "bounce";

export type InboundOutreachEventInput = {
  eventType: InboundEventType;
  campaignType?: OutreachCampaignType;
  provider?: string;
  externalEventId?: string;
  fromEmail?: string;
  toEmail?: string;
  contactEmail?: string;
  senderEmail?: string;
  subject?: string;
  body?: string;
  occurredAt?: Date | string | null;
  rawPayload?: unknown;
};

export type InboundMatchCandidate = {
  campaignType: OutreachCampaignType;
  queueId: string;
  messageId: string;
  leadId: string;
  campaignId: string | null;
  subject: string | null;
  sentAt: Date | null;
  replyReceived: boolean;
  responseReceived: boolean;
  emailBounced: boolean;
  generationContext?: unknown;
};

export function normalizeInboundEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizeInboundSubject(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(re|fw|fwd)\s*:\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function chooseInboundCandidate(
  candidates: InboundMatchCandidate[],
  input: { campaignType?: OutreachCampaignType; subject?: string | null; rawPayload?: unknown }
): InboundMatchCandidate | null {
  const scoped = input.campaignType
    ? candidates.filter((candidate) => candidate.campaignType === input.campaignType)
    : candidates;

  if (scoped.length === 0) return null;

  const metadataMatches = scoped.filter((candidate) => matchesInboundMetadata(candidate, input.rawPayload));
  if (metadataMatches.length === 1) return metadataMatches[0] ?? null;
  if (metadataMatches.length > 1) {
    return metadataMatches
      .slice()
      .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))[0] ?? null;
  }

  const normalizedSubject = normalizeInboundSubject(input.subject);
  if (normalizedSubject) {
    const subjectMatches = scoped.filter(
      (candidate) => normalizeInboundSubject(candidate.subject) === normalizedSubject
    );
    if (subjectMatches.length === 1) return subjectMatches[0] ?? null;
    if (subjectMatches.length > 1) return null;
  }

  return scoped.length === 1 ? scoped[0] ?? null : null;
}

function readRawPayloadHeader(rawPayload: unknown, name: string): string {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  const headers = (rawPayload as { headers?: Array<{ name?: string; value?: string }> }).headers;
  if (!Array.isArray(headers)) return "";
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function readOutboundMetadata(candidate: InboundMatchCandidate) {
  if (!candidate.generationContext || typeof candidate.generationContext !== "object" || Array.isArray(candidate.generationContext)) {
    return null;
  }

  const outbound = (candidate.generationContext as { outbound?: unknown }).outbound;
  if (!outbound || typeof outbound !== "object" || Array.isArray(outbound)) {
    return null;
  }

  return outbound as {
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
    rfcMessageId?: string | null;
  };
}

function matchesInboundMetadata(candidate: InboundMatchCandidate, rawPayload: unknown): boolean {
  const outbound = readOutboundMetadata(candidate);
  if (!outbound) return false;

  const threadId = rawPayload && typeof rawPayload === "object"
    ? ((rawPayload as { threadId?: string | null }).threadId ?? null)
    : null;
  const inReplyTo = readRawPayloadHeader(rawPayload, "In-Reply-To");
  const references = readRawPayloadHeader(rawPayload, "References");

  if (threadId && outbound.gmailThreadId && threadId === outbound.gmailThreadId) {
    return true;
  }

  const replySignals = `${inReplyTo} ${references}`.toLowerCase();
  return [outbound.rfcMessageId, outbound.gmailMessageId]
    .filter((value): value is string => Boolean(value))
    .some((value) => replySignals.includes(value.toLowerCase()));
}

export function getReplyMutationPlan(candidate: Pick<InboundMatchCandidate, "replyReceived">) {
  return {
    markMessageReplyReceived: true,
    incrementCampaignReplyCount: !candidate.replyReceived,
  };
}

export function getBounceMutationPlan(candidate: Pick<InboundMatchCandidate, "emailBounced">) {
  return {
    markLeadBounced: true,
    incrementCampaignBounceCount: !candidate.emailBounced,
  };
}

function getLogPrefix(campaignType?: OutreachCampaignType): string {
  if (campaignType === "jobs") return "[Job Poster Reply]";
  if (campaignType === "contractor") return "[Contractor Reply]";
  return "[LGS Reply]";
}

function coerceOccurredAt(value?: Date | string | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getBounceReason(input: InboundOutreachEventInput): string {
  return input.body?.trim() || input.subject?.trim() || "Inbound bounce detected";
}

function buildReplyEventKey(args: {
  input: InboundOutreachEventInput;
  contactEmail: string;
  senderEmail: string;
  occurredAt: Date;
}): string {
  if (args.input.externalEventId?.trim()) {
    return `${args.input.provider?.trim() || "manual"}:${args.input.externalEventId.trim()}`;
  }
  return [
    args.input.provider?.trim() || "manual",
    args.input.eventType,
    args.contactEmail,
    args.senderEmail,
    normalizeInboundSubject(args.input.subject),
    args.occurredAt.toISOString(),
  ].join(":");
}

function readProcessedReplyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function loadContractorCandidates(contactEmail: string, senderEmail: string) {
  return db
    .select({
      campaignType: sql<OutreachCampaignType>`'contractor'`,
      queueId: lgsOutreachQueue.id,
      messageId: outreachMessages.id,
      leadId: contractorLeads.id,
      campaignId: contractorLeads.campaignId,
      subject: outreachMessages.subject,
      sentAt: lgsOutreachQueue.sentAt,
      replyReceived: outreachMessages.replyReceived,
      responseReceived: contractorLeads.responseReceived,
      emailBounced: sql<boolean>`coalesce(${contractorLeads.emailBounced}, false)`,
      generationContext: outreachMessages.generationContext,
    })
    .from(lgsOutreachQueue)
    .innerJoin(outreachMessages, eq(lgsOutreachQueue.outreachMessageId, outreachMessages.id))
    .innerJoin(contractorLeads, eq(lgsOutreachQueue.leadId, contractorLeads.id))
    .where(
      and(
        sql`lower(${contractorLeads.email}) = ${contactEmail}`,
        sql`lower(${lgsOutreachQueue.senderAccount}) = ${senderEmail}`,
        inArray(lgsOutreachQueue.sendStatus, ["sent", "failed"])
      )
    )
    .orderBy(desc(lgsOutreachQueue.sentAt), desc(outreachMessages.createdAt))
    .limit(10);
}

async function loadJobPosterCandidates(contactEmail: string, senderEmail: string) {
  return db
    .select({
      campaignType: sql<OutreachCampaignType>`'jobs'`,
      queueId: jobPosterEmailQueue.id,
      messageId: jobPosterEmailMessages.id,
      leadId: jobPosterLeads.id,
      campaignId: jobPosterEmailMessages.campaignId,
      subject: jobPosterEmailMessages.subject,
      sentAt: jobPosterEmailQueue.sentAt,
      replyReceived: jobPosterEmailMessages.replyReceived,
      responseReceived: jobPosterLeads.responseReceived,
      emailBounced: sql<boolean>`coalesce(${jobPosterLeads.emailBounced}, false)`,
      generationContext: jobPosterEmailMessages.generationContext,
    })
    .from(jobPosterEmailQueue)
    .innerJoin(jobPosterEmailMessages, eq(jobPosterEmailQueue.messageId, jobPosterEmailMessages.id))
    .innerJoin(jobPosterLeads, eq(jobPosterEmailMessages.leadId, jobPosterLeads.id))
    .where(
      and(
        sql`lower(${jobPosterLeads.email}) = ${contactEmail}`,
        sql`lower(${jobPosterEmailQueue.senderEmail}) = ${senderEmail}`,
        inArray(jobPosterEmailQueue.status, ["sent", "failed"])
      )
    )
    .orderBy(desc(jobPosterEmailQueue.sentAt), desc(jobPosterEmailMessages.createdAt))
    .limit(10);
}

async function recordInboundEvent(args: {
  campaignType: OutreachCampaignType;
  input: InboundOutreachEventInput;
  contactEmail: string;
  senderEmail: string;
  occurredAt: Date;
  matched: InboundMatchCandidate | null;
}) {
  await db.insert(lgsInboundEvents).values({
    provider: args.input.provider?.trim() || "manual",
    externalEventId: args.input.externalEventId?.trim() || null,
    campaignType: args.campaignType,
    eventType: args.input.eventType,
    fromEmail: args.contactEmail,
    toEmail: args.senderEmail,
    subject: args.input.subject?.trim() || null,
    body: args.input.body?.trim() || null,
    matchedMessageId: args.matched?.messageId ?? null,
    matchedLeadId: args.matched?.leadId ?? null,
    matchedCampaignId: args.matched?.campaignId ?? null,
    rawPayload: args.input.rawPayload ?? null,
    processedAt: args.occurredAt,
  });
}

export async function matchInboundOutreachCandidate(input: {
  campaignType?: OutreachCampaignType;
  contactEmail: string;
  senderEmail: string;
  subject?: string | null;
  rawPayload?: unknown;
}) {
  const contactEmail = normalizeInboundEmail(input.contactEmail);
  const senderEmail = normalizeInboundEmail(input.senderEmail);
  if (!contactEmail || !senderEmail) return null;

  const candidates = input.campaignType === "jobs"
    ? await loadJobPosterCandidates(contactEmail, senderEmail)
    : input.campaignType === "contractor"
      ? await loadContractorCandidates(contactEmail, senderEmail)
      : [
          ...(await loadContractorCandidates(contactEmail, senderEmail)),
          ...(await loadJobPosterCandidates(contactEmail, senderEmail)),
        ];

  return chooseInboundCandidate(candidates, {
    campaignType: input.campaignType,
    subject: input.subject,
    rawPayload: input.rawPayload,
  });
}

export async function ingestInboundOutreachEvent(input: InboundOutreachEventInput) {
  const contactEmail = normalizeInboundEmail(input.contactEmail ?? input.fromEmail);
  const senderEmail = normalizeInboundEmail(input.senderEmail ?? input.toEmail);
  if (!contactEmail || !senderEmail) {
    throw new Error("contact_email_and_sender_email_required");
  }

  const occurredAt = coerceOccurredAt(input.occurredAt);
  const replyEventKey = buildReplyEventKey({ input, contactEmail, senderEmail, occurredAt });
  const lookupCampaignType = input.campaignType;
  const receivedPrefix = getLogPrefix(lookupCampaignType);
  console.log(`${receivedPrefix} Inbound received`, {
    eventType: input.eventType,
    provider: input.provider ?? "manual",
    campaignType: lookupCampaignType ?? "unknown",
    contactEmail,
    senderEmail,
    externalEventId: input.externalEventId ?? null,
  });

  if (input.externalEventId?.trim()) {
    const [existingEvent] = await db
      .select({
        id: lgsInboundEvents.id,
        campaignType: lgsInboundEvents.campaignType,
        eventType: lgsInboundEvents.eventType,
        matchedMessageId: lgsInboundEvents.matchedMessageId,
        matchedLeadId: lgsInboundEvents.matchedLeadId,
        matchedCampaignId: lgsInboundEvents.matchedCampaignId,
      })
      .from(lgsInboundEvents)
      .where(
        and(
          eq(lgsInboundEvents.provider, input.provider?.trim() || "manual"),
          eq(lgsInboundEvents.externalEventId, input.externalEventId.trim())
        )
      )
      .limit(1);

    if (existingEvent) {
      return {
        ok: true,
        duplicate: true,
        matched: !!existingEvent.matchedMessageId,
        campaignType: existingEvent.campaignType as OutreachCampaignType,
        eventType: existingEvent.eventType as InboundEventType,
        messageId: existingEvent.matchedMessageId,
        leadId: existingEvent.matchedLeadId,
        campaignId: existingEvent.matchedCampaignId,
      };
    }
  }

  const matched = await matchInboundOutreachCandidate({
    campaignType: lookupCampaignType,
    contactEmail,
    senderEmail,
    subject: input.subject,
  });

  if (!matched) {
    await recordInboundEvent({
      campaignType: lookupCampaignType ?? "contractor",
      input,
      contactEmail,
      senderEmail,
      occurredAt,
      matched: null,
    });
    console.warn(`${receivedPrefix} No matching message found`, {
      eventType: input.eventType,
      campaignType: lookupCampaignType ?? "unknown",
      contactEmail,
      senderEmail,
      subject: input.subject ?? null,
      candidatesChecked: 0,
    });
    return { ok: true, duplicate: false, matched: false };
  }

  const matchedPrefix = getLogPrefix(matched.campaignType);
  console.log(`${matchedPrefix} Message matched`, {
    eventType: input.eventType,
    messageId: matched.messageId,
    leadId: matched.leadId,
    campaignId: matched.campaignId,
  });

  const result = await db.transaction(async (tx) => {
    if (input.eventType === "reply") {
      const plan = getReplyMutationPlan(matched);

      if (matched.campaignType === "jobs") {
        const [leadState] = await tx
          .select({
            processedReplyIds: jobPosterLeads.processedReplyIds,
            replyCount: jobPosterLeads.replyCount,
            website: jobPosterLeads.website,
            campaignId: jobPosterLeads.campaignId,
          })
          .from(jobPosterLeads)
          .where(eq(jobPosterLeads.id, matched.leadId))
          .limit(1);
        const processedReplyIds = readProcessedReplyIds(leadState?.processedReplyIds);
        const shouldIncrementLeadReplyCount = !processedReplyIds.includes(replyEventKey);

        await tx
          .update(jobPosterEmailMessages)
          .set({ replyReceived: true, updatedAt: occurredAt })
          .where(eq(jobPosterEmailMessages.id, matched.messageId));

        await tx
          .update(jobPosterLeads)
          .set({
            responseReceived: true,
            lastRepliedAt: occurredAt,
            outreachStage: "replied",
            status: "replied",
            replyCount: shouldIncrementLeadReplyCount
              ? sql`${jobPosterLeads.replyCount} + 1`
              : jobPosterLeads.replyCount,
            processedReplyIds: shouldIncrementLeadReplyCount
              ? sql`${jobPosterLeads.processedReplyIds} || ${JSON.stringify([replyEventKey])}::jsonb`
              : jobPosterLeads.processedReplyIds,
            scoreDirty: true,
            updatedAt: occurredAt,
          })
          .where(eq(jobPosterLeads.id, matched.leadId));

        console.log("[Reply] Lead updated", {
          pipeline: "jobs",
          leadId: matched.leadId,
          replyEventKey,
          incremented: shouldIncrementLeadReplyCount,
        });

        if (plan.incrementCampaignReplyCount && matched.campaignId) {
          await tx
            .update(leadFinderCampaigns)
            .set({ replyCount: sql`${leadFinderCampaigns.replyCount} + 1` })
            .where(eq(leadFinderCampaigns.id, matched.campaignId));
        }

        return {
          duplicate: !shouldIncrementLeadReplyCount,
          campaignCounterUpdated: plan.incrementCampaignReplyCount && !!matched.campaignId,
          website: leadState?.website ?? null,
        };
      } else {
        const [leadState] = await tx
          .select({
            processedReplyIds: contractorLeads.processedReplyIds,
            replyCount: contractorLeads.replyCount,
            website: contractorLeads.website,
            campaignId: contractorLeads.campaignId,
          })
          .from(contractorLeads)
          .where(eq(contractorLeads.id, matched.leadId))
          .limit(1);
        const processedReplyIds = readProcessedReplyIds(leadState?.processedReplyIds);
        const shouldIncrementLeadReplyCount = !processedReplyIds.includes(replyEventKey);

        await tx
          .update(outreachMessages)
          .set({ replyReceived: true, status: "sent" })
          .where(eq(outreachMessages.id, matched.messageId));

        await tx
          .update(contractorLeads)
          .set({
            responseReceived: true,
            lastRepliedAt: occurredAt,
            outreachStage: "replied",
            status: "replied",
            replyCount: shouldIncrementLeadReplyCount
              ? sql`${contractorLeads.replyCount} + 1`
              : contractorLeads.replyCount,
            processedReplyIds: shouldIncrementLeadReplyCount
              ? sql`${contractorLeads.processedReplyIds} || ${JSON.stringify([replyEventKey])}::jsonb`
              : contractorLeads.processedReplyIds,
            scoreDirty: true,
            updatedAt: occurredAt,
          })
          .where(eq(contractorLeads.id, matched.leadId));

        console.log("[Reply] Lead updated", {
          pipeline: "contractor",
          leadId: matched.leadId,
          replyEventKey,
          incremented: shouldIncrementLeadReplyCount,
        });

        if (plan.incrementCampaignReplyCount && matched.campaignId) {
          await tx
            .update(leadFinderCampaigns)
            .set({ replyCount: sql`${leadFinderCampaigns.replyCount} + 1` })
            .where(eq(leadFinderCampaigns.id, matched.campaignId));
        }

        return {
          duplicate: !shouldIncrementLeadReplyCount,
          campaignCounterUpdated: plan.incrementCampaignReplyCount && !!matched.campaignId,
          website: leadState?.website ?? null,
        };
      }

    }

    const plan = getBounceMutationPlan(matched);
    const bounceReason = getBounceReason(input);

    if (matched.campaignType === "jobs") {
      await tx
        .update(jobPosterEmailQueue)
        .set({
          senderEmail,
          status: "failed",
          errorMessage: bounceReason,
          sentAt: matched.sentAt ?? occurredAt,
        })
        .where(eq(jobPosterEmailQueue.id, matched.queueId));

      await tx
        .update(jobPosterEmailMessages)
        .set({ status: "failed", updatedAt: occurredAt })
        .where(eq(jobPosterEmailMessages.id, matched.messageId));

      await tx
        .update(jobPosterLeads)
        .set({
          emailBounced: true,
          bounceReason,
          status: "failed",
          scoreDirty: true,
          updatedAt: occurredAt,
        })
        .where(eq(jobPosterLeads.id, matched.leadId));
    } else {
      await tx
        .update(lgsOutreachQueue)
        .set({
          senderAccount: senderEmail,
          sendStatus: "failed",
          errorMessage: bounceReason,
          sentAt: matched.sentAt ?? occurredAt,
        })
        .where(eq(lgsOutreachQueue.id, matched.queueId));

      await tx
        .update(outreachMessages)
        .set({ status: "failed" })
        .where(eq(outreachMessages.id, matched.messageId));

      await tx
        .update(contractorLeads)
        .set({
          emailBounced: true,
          bounceReason,
          scoreDirty: true,
          status: "failed",
          updatedAt: occurredAt,
        })
        .where(eq(contractorLeads.id, matched.leadId));
    }

    if (plan.incrementCampaignBounceCount && matched.campaignId) {
      await tx
        .update(leadFinderCampaigns)
        .set({ bounceCount: sql`${leadFinderCampaigns.bounceCount} + 1` })
        .where(eq(leadFinderCampaigns.id, matched.campaignId));
    }

    return {
      duplicate: !plan.incrementCampaignBounceCount,
      campaignCounterUpdated: plan.incrementCampaignBounceCount && !!matched.campaignId,
      website: null,
    };
  });

  await recordInboundEvent({
    campaignType: matched.campaignType,
    input,
    contactEmail,
    senderEmail,
    occurredAt,
    matched,
  });

  console.log(`${matchedPrefix} Campaign updated`, {
    eventType: input.eventType,
    campaignId: matched.campaignId,
    messageId: matched.messageId,
    leadId: matched.leadId,
    duplicate: result.duplicate,
    campaignCounterUpdated: result.campaignCounterUpdated,
  });

  if (input.eventType === "reply" && matched.campaignId && result.website) {
    await syncCampaignDomainReplyRate({
      pipeline: matched.campaignType,
      campaignId: matched.campaignId,
      website: result.website,
    });
  }

  if (matched.campaignType === "jobs") {
    await scoreAndSaveJobPosterLead(matched.leadId);
  } else {
    await scoreAndSaveContractorLead(matched.leadId);
  }
  console.log("[Scoring] Boost applied", {
    pipeline: matched.campaignType,
    leadId: matched.leadId,
    eventType: input.eventType,
  });

  return {
    ok: true,
    duplicate: result.duplicate,
    matched: true,
    campaignType: matched.campaignType,
    messageId: matched.messageId,
    leadId: matched.leadId,
    campaignId: matched.campaignId,
  };
}

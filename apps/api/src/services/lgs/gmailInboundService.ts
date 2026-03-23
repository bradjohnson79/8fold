import { google, gmail_v1 } from "googleapis";
import { matchInboundOutreachCandidate } from "./inboundOutreachService";
import { getPipelineForInboundMailbox, getTrackedInboundMailboxes, type LgsInboundPipeline } from "./gmailInboundConfig";
import { createGmailClientForSender, hasGmailTokenForSender } from "./outreachGmailSenderService";
import { POST as postInboundRoute } from "@/app/api/lgs/outreach/inbound/route";

export type GmailInboundNormalizedEvent = {
  event_type: "reply" | "bounce";
  campaign_type: "contractor" | "jobs";
  provider: "gmail";
  external_event_id: string;
  from_email: string;
  to_email: string;
  contact_email?: string;
  sender_email?: string;
  subject: string;
  body: string;
  occurred_at: string;
  raw_payload: Record<string, unknown>;
};

export type GmailInboundMessageClassification =
  | { kind: "reply"; normalized: GmailInboundNormalizedEvent }
  | { kind: "bounce"; normalized: GmailInboundNormalizedEvent }
  | { kind: "ignore"; reason: string };

export type GmailInboundInboxResult = {
  inbox: string;
  pipeline: LgsInboundPipeline;
  candidatesFound: number;
  repliesPosted: number;
  bouncesPosted: number;
  ignored: number;
  duplicatesSkipped: number;
  unmatched: number;
};

export type GmailInboundWorkerResult = {
  inboxes: GmailInboundInboxResult[];
  totalCandidates: number;
  totalRepliesPosted: number;
  totalBouncesPosted: number;
  totalIgnored: number;
  totalDuplicatesSkipped: number;
  totalUnmatched: number;
};

const GMAIL_SCAN_QUERY = "in:inbox newer_than:14d -category:promotions -category:social";
const GMAIL_SCAN_LIMIT = 25;
const REPLY_SUBJECT_RE = /^(re|fw|fwd)\s*:/i;
const BOUNCE_FROM_RE = /(mailer-daemon|mail delivery subsystem|postmaster|delivery status notification)/i;
const BOUNCE_SUBJECT_RE = /(delivery status notification|delivery failure|delivery incomplete|undeliverable|returned mail|mail delivery subsystem|failure notice|couldn't be delivered)/i;
const BOUNCE_BODY_RE = /(550[\s:-]|mailbox unavailable|undeliverable|delivery status notification|address not found|recipient address rejected|message blocked|permanent failure)/i;
const EMAIL_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

export function extractEmailAddress(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/) ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[1] ?? match[0] : null;
}

function decodeBase64Url(value?: string | null): string {
  if (!value) return "";
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function collectBodyTexts(part?: gmail_v1.Schema$MessagePart | null): string[] {
  if (!part) return [];
  const currentMimeType = (part.mimeType ?? "").toLowerCase();
  const ownBody = decodeBase64Url(part.body?.data);
  const childTexts = (part.parts ?? []).flatMap((child) => collectBodyTexts(child));

  if (currentMimeType === "text/plain" && ownBody.trim()) {
    return [ownBody, ...childTexts];
  }
  if (!part.parts?.length && ownBody.trim()) {
    return [ownBody];
  }
  return childTexts;
}

function getBestBodyText(message: gmail_v1.Schema$Message): string {
  const texts = collectBodyTexts(message.payload);
  if (texts.length > 0) return texts.join("\n\n").trim();
  return decodeBase64Url(message.payload?.body?.data).trim();
}

function getOccurredAt(message: gmail_v1.Schema$Message): string {
  const internalDate = Number(message.internalDate ?? 0);
  if (Number.isFinite(internalDate) && internalDate > 0) {
    return new Date(internalDate).toISOString();
  }
  return new Date().toISOString();
}

function buildRawPayload(message: gmail_v1.Schema$Message) {
  return {
    id: message.id ?? null,
    threadId: message.threadId ?? null,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet ?? null,
    headers: (message.payload?.headers ?? []).map((header) => ({
      name: header.name ?? "",
      value: header.value ?? "",
    })),
  };
}

export function isLikelyBounceMessage(input: { fromEmail?: string | null; subject?: string | null; body?: string | null }) {
  const fromEmail = input.fromEmail ?? "";
  const subject = input.subject ?? "";
  const body = input.body ?? "";
  return BOUNCE_FROM_RE.test(fromEmail) || BOUNCE_SUBJECT_RE.test(subject) || BOUNCE_BODY_RE.test(body);
}

export function extractFailedRecipient(input: { headers?: gmail_v1.Schema$MessagePartHeader[]; body?: string | null }) {
  const headerCandidates = [
    getHeader(input.headers, "X-Failed-Recipients"),
    getHeader(input.headers, "Final-Recipient"),
    getHeader(input.headers, "Original-Recipient"),
  ];

  for (const candidate of headerCandidates) {
    const email = extractEmailAddress(candidate);
    if (email) return email.trim().toLowerCase();
  }

  const body = input.body ?? "";
  const matches = Array.from(body.matchAll(EMAIL_RE)).map((match) => match[1]?.trim().toLowerCase()).filter(Boolean) as string[];
  return matches.find((email) => !email.includes("mailer-daemon") && !email.includes("postmaster")) ?? null;
}

function looksLikeReply(input: { fromEmail: string; subject: string; headers: gmail_v1.Schema$MessagePartHeader[] | undefined }) {
  const inReplyTo = getHeader(input.headers, "In-Reply-To");
  const references = getHeader(input.headers, "References");
  return Boolean(inReplyTo || references || REPLY_SUBJECT_RE.test(input.subject) || !isTrackedSystemSender(input.fromEmail));
}

function isTrackedSystemSender(email: string) {
  const normalized = email.trim().toLowerCase();
  return getTrackedInboundMailboxes().includes(normalized);
}

async function classifyMessage(args: {
  inbox: string;
  pipeline: LgsInboundPipeline;
  message: gmail_v1.Schema$Message;
}): Promise<GmailInboundMessageClassification> {
  const headers = args.message.payload?.headers ?? [];
  const subject = getHeader(headers, "Subject");
  const fromEmail = extractEmailAddress(getHeader(headers, "From"))?.toLowerCase() ?? "";
  const deliveredTo = extractEmailAddress(getHeader(headers, "Delivered-To"))?.toLowerCase();
  const toHeader = extractEmailAddress(getHeader(headers, "To"))?.toLowerCase();
  const receiver = deliveredTo ?? toHeader ?? args.inbox;
  const body = getBestBodyText(args.message);
  const occurredAt = getOccurredAt(args.message);
  const externalEventId = args.message.id ?? "";

  if (!externalEventId || receiver !== args.inbox) {
    return { kind: "ignore", reason: "receiver_not_tracked" };
  }

  if (isLikelyBounceMessage({ fromEmail, subject, body })) {
    const failedRecipient = extractFailedRecipient({ headers, body });
    if (!failedRecipient) {
      return { kind: "ignore", reason: "bounce_without_failed_recipient" };
    }

    const match = await matchInboundOutreachCandidate({
      campaignType: args.pipeline,
      contactEmail: failedRecipient,
      senderEmail: args.inbox,
      subject,
    });
    if (!match) {
      return { kind: "ignore", reason: "bounce_unmatched" };
    }

    return {
      kind: "bounce",
      normalized: {
        event_type: "bounce",
        campaign_type: args.pipeline,
        provider: "gmail",
        external_event_id: externalEventId,
        from_email: fromEmail || "mailer-daemon@googlemail.com",
        to_email: args.inbox,
        contact_email: failedRecipient,
        sender_email: args.inbox,
        subject,
        body,
        occurred_at: occurredAt,
        raw_payload: buildRawPayload(args.message),
      },
    };
  }

  if (!fromEmail || fromEmail === args.inbox || isTrackedSystemSender(fromEmail)) {
    return { kind: "ignore", reason: "non_prospect_sender" };
  }

  if (!looksLikeReply({ fromEmail, subject, headers })) {
    return { kind: "ignore", reason: "missing_reply_signal" };
  }

  const match = await matchInboundOutreachCandidate({
    campaignType: args.pipeline,
    contactEmail: fromEmail,
    senderEmail: args.inbox,
    subject,
  });
  if (!match) {
    return { kind: "ignore", reason: "reply_unmatched" };
  }

  return {
    kind: "reply",
    normalized: {
      event_type: "reply",
      campaign_type: args.pipeline,
      provider: "gmail",
      external_event_id: externalEventId,
      from_email: fromEmail,
      to_email: args.inbox,
      contact_email: fromEmail,
      sender_email: args.inbox,
      subject,
      body,
      occurred_at: occurredAt,
      raw_payload: buildRawPayload(args.message),
    },
  };
}

async function listCandidateMessages(gmail: gmail_v1.Gmail) {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: GMAIL_SCAN_QUERY,
    maxResults: GMAIL_SCAN_LIMIT,
  });
  return response.data.messages ?? [];
}

async function getMessage(gmail: gmail_v1.Gmail, messageId: string) {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return response.data;
}

async function postNormalizedInboundEvent(payload: GmailInboundNormalizedEvent) {
  const response = await postInboundRoute(
    new Request("http://localhost/api/lgs/outreach/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json as { ok?: boolean; data?: { duplicate?: boolean; matched?: boolean } } };
}

export async function scanInboundInbox(inbox: string): Promise<GmailInboundInboxResult> {
  const pipeline = getPipelineForInboundMailbox(inbox);
  if (!pipeline) {
    throw new Error(`untracked_inbound_inbox:${inbox}`);
  }
  if (!hasGmailTokenForSender(inbox)) {
    throw new Error(`gmail_token_missing_for_inbox:${inbox}`);
  }

  console.log("[LGS Inbound] Inbox scan started", { inbox, pipeline });
  const gmail = createGmailClientForSender(inbox);
  const candidates = await listCandidateMessages(gmail);

  const result: GmailInboundInboxResult = {
    inbox,
    pipeline,
    candidatesFound: candidates.length,
    repliesPosted: 0,
    bouncesPosted: 0,
    ignored: 0,
    duplicatesSkipped: 0,
    unmatched: 0,
  };

  for (const candidate of candidates) {
    const messageId = candidate.id ?? "";
    if (!messageId) continue;

    const message = await getMessage(gmail, messageId);
    const classified = await classifyMessage({ inbox, pipeline, message });

    if (classified.kind === "ignore") {
      result.ignored += 1;
      if (classified.reason.includes("unmatched")) {
        result.unmatched += 1;
      }
      continue;
    }

    const posted = await postNormalizedInboundEvent(classified.normalized);
    if (!posted.body.ok) {
      console.warn("[LGS Inbound] Normalized post failed", {
        inbox,
        messageId,
        kind: classified.kind,
        status: posted.status,
        body: posted.body,
      });
      continue;
    }

    if (posted.body.data?.duplicate) {
      result.duplicatesSkipped += 1;
      continue;
    }

    if (classified.kind === "reply") result.repliesPosted += 1;
    if (classified.kind === "bounce") result.bouncesPosted += 1;
  }

  console.log("[LGS Inbound] Inbox scan completed", result);
  return result;
}

export async function runGmailInboundCycle(): Promise<GmailInboundWorkerResult> {
  console.log("[LGS Inbound] Worker started");
  const inboxes = getTrackedInboundMailboxes();
  const results: GmailInboundInboxResult[] = [];

  for (const inbox of inboxes) {
    try {
      const scanned = await scanInboundInbox(inbox);
      results.push(scanned);
    } catch (error) {
      console.error("[LGS Inbound] Inbox scan error", {
        inbox,
        error: error instanceof Error ? error.message : String(error),
      });
      const pipeline = getPipelineForInboundMailbox(inbox) ?? "jobs";
      results.push({
        inbox,
        pipeline,
        candidatesFound: 0,
        repliesPosted: 0,
        bouncesPosted: 0,
        ignored: 0,
        duplicatesSkipped: 0,
        unmatched: 0,
      });
    }
  }

  const summary = results.reduce(
    (acc, current) => {
      acc.totalCandidates += current.candidatesFound;
      acc.totalRepliesPosted += current.repliesPosted;
      acc.totalBouncesPosted += current.bouncesPosted;
      acc.totalIgnored += current.ignored;
      acc.totalDuplicatesSkipped += current.duplicatesSkipped;
      acc.totalUnmatched += current.unmatched;
      return acc;
    },
    {
      inboxes: results,
      totalCandidates: 0,
      totalRepliesPosted: 0,
      totalBouncesPosted: 0,
      totalIgnored: 0,
      totalDuplicatesSkipped: 0,
      totalUnmatched: 0,
    } satisfies GmailInboundWorkerResult
  );

  console.log("[LGS Inbound] Worker completed", summary);
  return summary;
}

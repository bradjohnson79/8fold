/**
 * LGS Outreach: Send emails via Gmail API (OAuth2).
 * Bounce protection: on 550/bounce, mark contact invalid_email.
 */
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { senderPool } from "../../../db/schema/directoryEngine";
import { appendSignature } from "./outreachSignatureService";

export type GmailMessagePayload = {
  subject: string;
  body: string;
  contactEmail: string;
  senderAccount: string;
};

export type SenderGmailAuthRecord = {
  id: string;
  senderEmail: string;
  gmailRefreshToken: string | null;
  gmailAccessToken: string | null;
  gmailTokenExpiresAt: Date | null;
  gmailConnected: boolean;
};

function getOAuth2Client(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/SECRET or GMAIL_CLIENT_ID/SECRET required");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function normalizeSenderEmail(senderAccount: string): string {
  return senderAccount.trim().toLowerCase();
}

async function loadSenderFromDb(senderAccount: string): Promise<SenderGmailAuthRecord | null> {
  const normalized = normalizeSenderEmail(senderAccount);
  if (!normalized) return null;

  const { db } = await import("../../../db/drizzle");
  const [row] = await db
    .select({
      id: senderPool.id,
      senderEmail: senderPool.senderEmail,
      gmailRefreshToken: senderPool.gmailRefreshToken,
      gmailAccessToken: senderPool.gmailAccessToken,
      gmailTokenExpiresAt: senderPool.gmailTokenExpiresAt,
      gmailConnected: senderPool.gmailConnected,
    })
    .from(senderPool)
    .where(eq(senderPool.senderEmail, normalized))
    .limit(1);

  return row ?? null;
}

export async function getSenderGmailAuthRecord(
  senderAccount: string,
  dependencies?: {
    lookupSender?: (senderAccount: string) => Promise<SenderGmailAuthRecord | null>;
  }
): Promise<SenderGmailAuthRecord | null> {
  const normalized = normalizeSenderEmail(senderAccount);
  if (!normalized) return null;
  return (dependencies?.lookupSender ?? loadSenderFromDb)(normalized);
}

function hasConnectedRefreshToken(sender: SenderGmailAuthRecord | null): boolean {
  return Boolean(sender?.gmailConnected && sender.gmailRefreshToken?.trim());
}

/** Returns true if sender has a connected Gmail token in sender_pool. */
export async function hasGmailTokenForSender(
  senderAccount: string,
  dependencies?: {
    lookupSender?: (senderAccount: string) => Promise<SenderGmailAuthRecord | null>;
  }
): Promise<boolean> {
  const sender = await getSenderGmailAuthRecord(senderAccount, dependencies);
  return hasConnectedRefreshToken(sender);
}

async function sendRawGmailMessage(params: {
  refreshToken: string;
  raw: string;
}): Promise<{ messageId: string | null }> {
  const auth = getOAuth2Client(params.refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: params.raw },
  });

  return {
    messageId: response.data.id ?? null,
  };
}

function isBounceMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("550") ||
    lower.includes("bounce") ||
    lower.includes("recipient") ||
    lower.includes("invalid") ||
    lower.includes("rejected") ||
    lower.includes("permanent failure")
  );
}

function getMissingTokenError(senderAccount: string): Error {
  return new Error(`missing_token:${normalizeSenderEmail(senderAccount)}`);
}

function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `From: Brad Johnson <${params.from}>`,
    `To: ${params.to}`,
    `Reply-To: ${params.from}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${params.subject}`,
    "",
    params.body,
  ];
  return lines.join("\r\n");
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; bounce: true; message: string }
  | { ok: false; bounce: false; message: string };

export async function sendOutreachEmail(
  msg: GmailMessagePayload,
  dependencies?: {
    lookupSender?: (senderAccount: string) => Promise<SenderGmailAuthRecord | null>;
    sendMessage?: (params: { refreshToken: string; raw: string }) => Promise<{ messageId: string | null }>;
  }
): Promise<SendResult> {
  const senderAccount = normalizeSenderEmail(msg.senderAccount);
  if (!senderAccount) {
    throw new Error("sender_account_required");
  }

  const sender = await getSenderGmailAuthRecord(senderAccount, dependencies);
  if (!sender?.gmailConnected || !sender.gmailRefreshToken?.trim()) {
    throw getMissingTokenError(senderAccount);
  }
  const refreshToken = sender.gmailRefreshToken;

  const bodyWithSignature = appendSignature(msg.body);
  const mime = buildMimeMessage({
    from: senderAccount,
    to: msg.contactEmail,
    subject: msg.subject,
    body: bodyWithSignature,
  });

  const raw = base64UrlEncode(mime);

  try {
    const response = await (dependencies?.sendMessage ?? sendRawGmailMessage)({
      refreshToken,
      raw,
    });
    return { ok: true, messageId: response.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      ok: false,
      bounce: isBounceMessage(message),
      message,
    };
  }
}

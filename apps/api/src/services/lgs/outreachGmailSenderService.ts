/**
 * LGS Outreach: Send emails via Gmail API (OAuth2).
 * Bounce protection: on 550/bounce, mark contact invalid_email.
 */
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { appendSignature } from "./outreachSignatureService";

export type GmailMessagePayload = {
  subject: string;
  body: string;
  contactEmail: string;
  senderAccount: string;
};

export const GMAIL_SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
export const GMAIL_INBOUND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];
export const GMAIL_OAUTH_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

function getOAuth2Client(refreshToken: string) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET required");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, GMAIL_OAUTH_REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export const SENDER_ENV_PAIRS = [
  { sender: process.env.GMAIL_SENDER_1 ?? "info@8fold.app", token: process.env.GMAIL_REFRESH_TOKEN },
  { sender: process.env.GMAIL_SENDER_2 ?? "support@8fold.app", token: process.env.GMAIL_REFRESH_TOKEN_2 },
  { sender: process.env.GMAIL_SENDER_3 ?? "hello@8fold.app", token: process.env.GMAIL_REFRESH_TOKEN_3 },
  { sender: process.env.GMAIL_SENDER_4 ?? "partners@8fold.app", token: process.env.GMAIL_REFRESH_TOKEN_4 },
] as const;

export function getRefreshTokenForSender(senderAccount: string): string | null {
  const normalized = senderAccount.trim().toLowerCase();
  for (const { sender, token } of SENDER_ENV_PAIRS) {
    if (sender?.trim().toLowerCase() === normalized && token) return token;
  }
  return null;
}

export function listConfiguredLgsSenders(): string[] {
  return SENDER_ENV_PAIRS
    .filter((pair) => pair.sender && pair.token)
    .map((pair) => pair.sender.trim().toLowerCase());
}

export function getConfiguredGmailSenders(): string[] {
  return listConfiguredLgsSenders();
}

/** Returns true if sender has a configured Gmail token. */
export function hasGmailTokenForSender(senderAccount: string): boolean {
  return getRefreshTokenForSender(senderAccount) !== null;
}

export function createGmailClientForSender(senderAccount: string): gmail_v1.Gmail {
  const refreshToken = getRefreshTokenForSender(senderAccount);
  if (!refreshToken) {
    throw new Error(`No Gmail refresh token configured for sender: ${senderAccount}`);
  }

  const auth = getOAuth2Client(refreshToken);
  return google.gmail({ version: "v1", auth });
}

function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
}): string {
  const lines = [
    `From: Brad Johnson <${params.from}>`,
    `To: ${params.to}`,
    `Reply-To: ${params.from}`,
    `Message-ID: ${params.messageId}`,
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
  | { ok: true; gmailMessageId: string | null; gmailThreadId: string | null; rfcMessageId: string; senderAccount: string }
  | { ok: false; bounce: true; message: string }
  | { ok: false; bounce: false; message: string };

function buildOutboundMessageId(senderAccount: string): string {
  const [localPart = "outreach", domain = "8fold.app"] = senderAccount.trim().toLowerCase().split("@");
  return `<lgs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${localPart}@${domain}>`;
}

export async function sendOutreachEmail(msg: GmailMessagePayload): Promise<SendResult> {
  const senderAccount = msg.senderAccount ?? process.env.GMAIL_SENDER_1 ?? "info@8fold.app";
  const gmail = createGmailClientForSender(senderAccount);
  const rfcMessageId = buildOutboundMessageId(senderAccount);

  const bodyWithSignature = appendSignature(msg.body);
  const mime = buildMimeMessage({
    from: senderAccount,
    to: msg.contactEmail,
    subject: msg.subject,
    body: bodyWithSignature,
    messageId: rfcMessageId,
  });

  const raw = base64UrlEncode(mime);

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return {
      ok: true,
      gmailMessageId: response.data.id ?? null,
      gmailThreadId: response.data.threadId ?? null,
      rfcMessageId,
      senderAccount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    const isBounce =
      lower.includes("550") ||
      lower.includes("bounce") ||
      lower.includes("recipient") ||
      lower.includes("invalid") ||
      lower.includes("rejected") ||
      lower.includes("permanent failure");

    return {
      ok: false,
      bounce: isBounce,
      message,
    };
  }
}

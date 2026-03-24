/**
 * LGS Outreach Email Generation — single prompt, no branches.
 *
 * Old system: SYSTEM_PROMPT + user prompt templates + JSON parsing + conditional
 * message types + enrichment-dependent fallbacks + CTA assembly = garbage output.
 *
 * New system: one prompt, plain text output, signature appended by system.
 */
import crypto from "crypto";
import { getOpenAiClient } from "@/src/lib/openai";
import { computeBodyHash } from "./outreachHashService";

// ─── Types (kept for caller compatibility) ────────────────────────────────────

export type MessageType = "intro_standard";

export type GenerateInput = {
  businessName: string;
  trade?: string;
  city?: string;
  state?: string;
  contactName?: string;
  leadPriority?: string;
  followupCount?: number;
  lastMessageTypeSent?: string | null;
};

export type GenerateResult = {
  subject: string;
  body: string;
  hash: string;
  messageType: MessageType;
  messageVersionHash: string;
};

const MESSAGE_VERSION = "v4-invitation";
const HTML_SIGNATURE = `<p>Brad Johnson<br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;

// ─── Single clean prompt ──────────────────────────────────────────────────────

function buildPrompt(input: GenerateInput): string {
  const businessName = input.businessName ?? "their business";
  const city = input.city ?? "their area";
  const trade = input.trade ?? "their work";

  return `Write a short outreach email to a contractor business.

Context:
- Business name: ${businessName}
- Trade: ${trade}
- Location: ${city}

About us:
8Fold connects contractors with real, vetted jobs.
There are no bidding wars and no lead fees.
Contractors receive qualified projects and a predictable workflow.

Goal:
This is NOT a sales email.
This is NOT a request for a call.
This is an invitation to join the platform.

Instructions:
- Address them naturally (team or business name)
- Introduce 8Fold clearly
- Explain the benefit briefly
- Direct them to visit https://8fold.app
- Tell them they can create a free account
- Keep tone professional, direct, and calm
- DO NOT suggest a call, meeting, or chat
- DO NOT ask for availability
- DO NOT use sales language
- Keep under 140 words

Ending:
Use a confident, non-pushy closing.

Output:
Return only the email body.`;
}

function buildSubject(input: GenerateInput): string {
  return input.businessName
    ? `Join 8Fold — ${input.businessName.trim()}`
    : "An invitation from 8Fold";
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateOutreachEmail(
  input: GenerateInput,
  existingHashes: Set<string>
): Promise<GenerateResult> {
  const openai = getOpenAiClient();
  const prompt = buildPrompt(input);
  const subject = buildSubject(input);

  console.log("PROMPT:", prompt);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // gpt-5-nano is a reasoning model — needs ~1600 tokens for internal reasoning
    // before output. 4000 gives enough headroom. temperature is not supported.
    const raw = (await openai.responses.create({
      model: process.env.OPENAI_MESSAGE_MODEL?.trim() || "gpt-5-nano",
      input: prompt,
      max_output_tokens: 4000,
    })) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

    const text =
      raw.output_text ||
      (raw.output as Array<{ content?: Array<{ text?: string }> }>)?.[0]?.content?.[0]?.text;

    console.log("OUTPUT:", text);

    if (!text?.trim()) {
      console.warn(`[generateOutreachEmail] empty output on attempt ${attempt + 1}`);
      continue;
    }

    // Guard: reject messages containing sales/scheduling language
    const cleaned = text.toLowerCase();
    if (
      cleaned.includes("call") ||
      cleaned.includes("chat") ||
      cleaned.includes("schedule") ||
      cleaned.includes("meeting")
    ) {
      console.warn(`[generateOutreachEmail] rejected — call/chat/schedule/meeting detected on attempt ${attempt + 1}`);
      continue;
    }

    const body = `${textToHtml(text)}\n${HTML_SIGNATURE}`;
    const hash = computeBodyHash(body);

    if (existingHashes.has(hash)) continue;

    return {
      subject,
      body,
      hash,
      messageType: "intro_standard",
      messageVersionHash: crypto
        .createHash("sha256")
        .update(MESSAGE_VERSION)
        .digest("hex")
        .slice(0, 16),
    };
  }

  throw new Error("Could not generate unique email after max attempts");
}

// ─── Legacy compat shims ──────────────────────────────────────────────────────

/** @deprecated — use generateOutreachEmail directly */
export function determineMessageType(): MessageType {
  return "intro_standard";
}

/** @deprecated — no-op */
export function computeMessageVersionHash(): string {
  return MESSAGE_VERSION;
}

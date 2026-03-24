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

const MESSAGE_VERSION = "v5-invitation";
const HTML_SIGNATURE = `<p>Brad Johnson<br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;
const DEFAULT_OUTREACH_MODEL = "gpt-4.1-mini";
const TEMPERATURE = 0.5;
const MAX_OUTPUT_TOKENS = 220;

// ─── Single clean prompt ──────────────────────────────────────────────────────

function buildPrompt(input: GenerateInput): string {
  const businessName = input.businessName ?? "their business";
  const city = input.city ?? "their area";
  const trade = input.trade ?? "their work";

  return `
Write a short outreach email to a contractor business.

Context:
- Business name: ${businessName || "their business"}
- Trade: ${trade || "their work"}
- Location: ${city || "their area"}

About us:
8Fold connects contractors with real, vetted jobs.
There are no bidding wars and no lead fees.
Contractors receive qualified projects and a predictable workflow.

Goal:
This is an invitation email, not a sales pitch.

Structure (follow exactly):
1. Start with a natural acknowledgment of their business or trade (mention their website or type of work)
2. Introduce 8Fold briefly
3. Explain how it helps contractors like them (simple, practical benefit)
4. Direct them to https://8fold.app to create a free account
5. Thank them for their time

Instructions:
- Sound human and observant (like you actually looked them up)
- Keep tone professional, calm, and grounded
- Do NOT ask for a call, meeting, or chat
- Do NOT use generic phrases like "I hope you're doing well"
- Do NOT sound like marketing copy
- Keep under 140 words

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
  const configuredModel = process.env.OPENAI_MESSAGE_MODEL?.trim();
  const model = configuredModel && configuredModel !== "gpt-5-nano"
    ? configuredModel
    : DEFAULT_OUTREACH_MODEL;

  console.log("PROMPT:", prompt);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = (await openai.responses.create({
      model,
      input: prompt,
      temperature: TEMPERATURE,
      max_output_tokens: MAX_OUTPUT_TOKENS,
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

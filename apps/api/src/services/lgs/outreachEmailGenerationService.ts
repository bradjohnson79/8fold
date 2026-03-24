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

const MESSAGE_VERSION = "v3-clean-single";
const HTML_SIGNATURE = `<p>Best,<br>\n<strong>Brad Johnson</strong><br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;

// ─── Single clean prompt ──────────────────────────────────────────────────────

function buildPrompt(input: GenerateInput): string {
  const name = input.businessName || "your business";
  const city = input.city || "your area";
  const trade = input.trade || "your type of work";

  return `Write a short, natural outreach email to a contractor.

Business: ${name}
Trade: ${trade}
Location: ${city}

Context:
8Fold connects contractors with real jobs without bidding wars or lead fees.

Write like a real person:
- no corporate tone
- no fluff
- no "hope you're doing well"
- no "visit our website"
- under 90 words
- end with a simple question

Only return the email body.`;
}

function buildSubject(input: GenerateInput): string {
  return input.businessName
    ? `Quick question — ${input.businessName.trim()}`
    : "Quick question about 8Fold";
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
    const raw = (await openai.responses.create({
      model: process.env.OPENAI_MESSAGE_MODEL?.trim() || "gpt-5-nano",
      input: prompt,
      temperature: 0.7,
      max_output_tokens: 160,
    })) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

    const text =
      raw.output_text ||
      (raw.output as Array<{ content?: Array<{ text?: string }> }>)?.[0]?.content?.[0]?.text;

    console.log("OUTPUT:", text);

    if (!text?.trim()) {
      console.warn(`[generateOutreachEmail] empty output on attempt ${attempt + 1}`);
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

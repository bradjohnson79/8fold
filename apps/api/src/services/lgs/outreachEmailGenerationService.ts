/**
 * LGS Outreach: Generate unique outreach emails via GPT-5 Nano.
 *
 * Assembly order (GPT only writes the body — system appends the rest):
 *   [gpt_body]   ← 3–4 short paragraphs, 90–140 words
 *   [cta_line]   ← system-locked, never from GPT
 *   [signature]  ← system-locked, never from GPT
 *
 * Returns JSON { subject, body } where body is the complete assembled HTML.
 *
 * Message types:
 *   intro_short         — sparse leads
 *   intro_standard      — default for most leads
 *   intro_trade_specific — richer leads with known trade + city
 *   followup_1          — first follow-up after no reply
 *   followup_2          — second follow-up after no reply
 */
import crypto from "crypto";
import { getOpenAiClient, OPENAI_APPRAISAL_MODEL } from "@/src/lib/openai";
import { computeBodyHash } from "./outreachHashService";

const MAX_REGENERATE_ATTEMPTS = 5;

// ── Message type definitions ─────────────────────────────────────────────────

export type MessageType =
  | "intro_short"
  | "intro_standard"
  | "intro_trade_specific"
  | "followup_1"
  | "followup_2";

export type GenerateInput = {
  businessName: string;
  trade: string;
  city: string;
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

// ── Message type selection ───────────────────────────────────────────────────

/**
 * Determines the appropriate message type for a lead.
 * Uses lastMessageTypeSent + followupCount as primary signals.
 * Never re-generates an intro if one was already sent.
 */
export function determineMessageType(input: GenerateInput): MessageType {
  const { followupCount = 0, lastMessageTypeSent } = input;

  // Follow-up path — driven by followup_count
  if (followupCount >= 2) return "followup_2";
  if (followupCount === 1) return "followup_1";

  // Guard: if an intro was already sent, don't generate another intro
  const introTypes: MessageType[] = ["intro_short", "intro_standard", "intro_trade_specific"];
  if (lastMessageTypeSent && introTypes.includes(lastMessageTypeSent as MessageType)) {
    // Treat as followup_1 if somehow we're here with no followup count
    return "followup_1";
  }

  // Intro path — based on available lead context only
  if (input.trade && input.city) return "intro_trade_specific";
  if (!input.trade && !input.city) return "intro_short";
  return "intro_standard";
}

/**
 * Compute a stable fingerprint of the strategic context used for generation.
 * Useful for later performance analysis — identifies which strategy produced which results.
 */
export function computeMessageVersionHash(
  messageType: MessageType,
  input: Pick<GenerateInput, "trade" | "city">
): string {
  const payload = `${messageType}|${input.trade ?? ""}|${input.city ?? ""}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are writing short outreach emails on behalf of Brad Johnson, COO at 8Fold.

About 8Fold:
8Fold is a fair-trade marketplace that connects skilled tradespeople with real local jobs — no bidding wars, no lead fees. Contractors keep most of the job value.

Your goal:
Start a real conversation. Not pitch. Not sell. Not sound corporate.

Tone:
- Direct and human
- Casual but professional — like a person, not a department
- Short sentences
- No fluff

DO NOT:
- Open with "Hi there," — use a real opener or dive straight in
- Say "I hope you're doing well"
- Say "I've been following your work" or "I'm impressed"
- Say "learn more on our website" or "visit our website"
- Use exclamation marks
- Use buzzwords: "revolutionary," "game-changing," "cutting-edge," "synergy"
- Invent facts about the contractor or their business
- Mention anything not provided in the lead data
- Praise or flatter the contractor
- Sound like a corporate sales script
- Include a call-to-action line — the system appends it
- Include a website link — the system appends it
- Include the signature — the system appends it

Approved openers (pick ONE that fits the available data):
- "My name's Brad Johnson, COO at 8Fold — reaching out to [business name] because..."
- "Brad Johnson here, COO at 8Fold. We're expanding our contractor network in [city] and [business name] came up..."
- "Brad Johnson, COO at 8Fold. I wanted to reach out because we're connecting with [trade] contractors in [city]..."
- If no data: start with a direct line like "Brad Johnson here from 8Fold — wanted to reach out about something that might be relevant to your work."

Personalization:
- If business_name exists: mention it naturally once
- If trade exists: mention it naturally once
- If city exists: mention it naturally once
- Do not stack all three into one awkward sentence
- Do not guess or invent missing information

Structure:
- 3 to 4 short paragraphs
- Each paragraph: 1 to 2 sentences
- Total: 80 to 130 words
- End with a simple question or soft invitation

Fallback (missing data):
- Skip any field that is not provided — do not draw attention to it

Hard constraints:
- Max 130 words
- Max 4 paragraphs
- Do not include a CTA, website link, or signature — all appended by the system

CRITICAL output format:
Return ONLY valid JSON with exactly two keys:
{
  "subject": "short subject line, 6–10 words, no hype",
  "body": "3–4 paragraph HTML body, NO signature, NO CTA, NO website link — use only <p>, <strong>, <br> tags"
}

No markdown. No code fences. Just the JSON.`;

// ─── System-locked CTA and signature (never from GPT) ─────────────────────────

const HTML_CTA = `<p>Worth a quick look — <a href="https://8fold.app" style="color:#3b82f6;">8fold.app</a>. Free to join, no commitment.</p>`;

const HTML_SIGNATURE = `<p>Best,<br>\n<strong>Brad Johnson</strong><br>\nChief Operations Officer<br>\n8Fold.app<br>\ninfo@8fold.app</p>`;

/**
 * Strip any GPT-generated CTA or signature attempt, then unconditionally
 * append the system-locked CTA and canonical HTML signature.
 *
 * This guarantees correct branding and CTA on every message regardless of
 * what the model returns.
 */
function assembleEmail(gptBody: string): string {
  let cleaned = gptBody
    // Remove any <p> that opens with a sign-off word
    .replace(/<p[^>]*>\s*(?:Best|Regards|Sincerely|Thanks|Thank you),?[\s\S]*?<\/p>\s*$/i, "")
    // Remove bare <br>-separated trailing sign-off blocks
    .replace(/(?:<br\s*\/?>[\s\S]*?)?(?:Best|Regards|Sincerely),?\s*<br>[\s\S]*?(?:8fold|info@)[\s\S]*?$/i, "")
    // Remove any CTA / website link paragraph GPT may have snuck in
    .replace(/<p[^>]*>[\s\S]*?8fold\.app[\s\S]*?<\/p>\s*$/i, "")
    .trimEnd();

  return `${cleaned}\n${HTML_CTA}\n${HTML_SIGNATURE}`;
}

// ─── User prompt templates (per message type) ────────────────────────────────

function buildDataLines(input: GenerateInput): string {
  return [
    input.businessName ? `Business name: ${input.businessName}` : "Business name: (not available)",
    input.trade        ? `Trade: ${input.trade}`                 : "Trade: (not available)",
    input.city         ? `City: ${input.city}`                   : "City: (not available)",
    input.state        ? `State: ${input.state}`                 : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(input: GenerateInput, messageType: MessageType): string {
  const dataLines = buildDataLines(input);
  const reminder = `Reminder:
- Do not include a subject line in the body
- Do not include a website link — it is appended by the system
- Do not include the signature — it is appended by the system
- Do not include a CTA line — it is appended by the system
- Return only the message body as HTML`;

  switch (messageType) {
    case "intro_short":
      return `Write a SHORT outreach email for this contractor lead. Keep it under 80 words — just a simple, friendly introduction.

Lead data:
${dataLines}

Goals:
- Brief intro: who we are (Brad Johnson, 8Fold)
- One sentence on what 8Fold does
- Invite them to check us out

Keep it simple. No detail. Light and easy.

${reminder}
- Target: 60–80 words`;

    case "intro_trade_specific":
      return `Write a targeted outreach email for this contractor lead. This is a high-quality lead — reference their trade and city naturally.

Lead data:
${dataLines}

Goals:
- Introduce Brad Johnson and 8Fold
- Mention the trade and city naturally once each
- Explain that we're expanding our contractor network in their area
- Explain that 8Fold connects skilled tradespeople with real local jobs
- Explain the practical benefit to the contractor

Personalization: Use trade and city each once. Do not force both into the same sentence.

${reminder}
- Target: 100–140 words`;

    case "followup_1":
      return `Write a short, polite follow-up email for this contractor lead. They were contacted once before and didn't reply.

Lead data:
${dataLines}

Goals:
- Brief reminder that we reached out before
- Acknowledge they may have been busy
- Re-invite them to check out 8Fold
- Keep it very short — this is a nudge, not a pitch

Do NOT:
- Sound desperate
- Repeat the full pitch from the first email
- Sound annoyed or pushy

${reminder}
- Target: 50–80 words`;

    case "followup_2":
      return `Write a brief final follow-up email for this contractor lead. They received two previous emails and haven't replied.

Lead data:
${dataLines}

Goals:
- Very short — one or two sentences max
- Acknowledge this is the last follow-up
- Leave the door open if they're ever interested
- End positively

Do NOT:
- Sound passive aggressive
- Repeat the pitch again
- Be overly formal

${reminder}
- Target: 30–50 words`;

    case "intro_standard":
    default:
      return `Write a short outreach email for this contractor lead.

Lead data:
${dataLines}

What the email should accomplish:
- Explain that we came across their company and are reaching out
- Explain that we are expanding 8Fold's contractor network in their area
- Briefly explain that 8Fold is a fair-trade marketplace connecting skilled tradespeople with real local jobs
- Briefly explain how this could benefit the contractor
- Invite them to learn more

Light personalization instructions:
- If available, mention the business name naturally once
- If available, mention the trade naturally once
- If available, mention the city naturally once
- Keep personalization subtle and natural
- Do not force all variables into the same sentence
- Do not mention unavailable fields

${reminder}
- Target: 90–140 words`;
  }
}

// ─── JSON parser ──────────────────────────────────────────────────────────────

/**
 * Parse JSON from model output, handling literal newlines inside string values
 * (common Nano quirk) and falling back to regex extraction.
 */
function parseJsonRobust(raw: string): { subject?: string; body?: string } {
  try {
    return JSON.parse(raw) as { subject?: string; body?: string };
  } catch { /* fall through */ }

  try {
    const fixed = raw.replace(/("(?:[^"\\]|\\.)*")/gs, (match) =>
      match.replace(/\r?\n/g, "\\n")
    );
    return JSON.parse(fixed) as { subject?: string; body?: string };
  } catch { /* fall through */ }

  const subjectMatch = raw.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const bodyMatch    = raw.match(/"body"\s*:\s*"([\s\S]*?)(?="?\s*}?\s*$|",?\s*"(?:subject|body)")/);
  if (subjectMatch) {
    return {
      subject: subjectMatch[1].replace(/\\n/g, "\n"),
      body: bodyMatch ? bodyMatch[1].replace(/\\n/g, "\n") : undefined,
    };
  }

  throw new Error("Cannot extract JSON from model output");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateOutreachEmail(
  input: GenerateInput,
  existingHashes: Set<string>
): Promise<GenerateResult> {
  const openai = getOpenAiClient();

  const messageType = determineMessageType(input);
  const messageVersionHash = computeMessageVersionHash(messageType, input);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${buildUserPrompt(input, messageType)}`;

  for (let attempt = 0; attempt < MAX_REGENERATE_ATTEMPTS; attempt++) {
    const raw = (await openai.responses.create({
      model: process.env.OPENAI_MESSAGE_MODEL?.trim() || OPENAI_APPRAISAL_MODEL,
      input: fullPrompt,
      temperature: 0.7,
      max_output_tokens: 300,
    })) as { output_text?: string };

    const rawAny = raw as Record<string, unknown>;
    const content: string =
      typeof rawAny?.output_text === "string"
        ? rawAny.output_text
        : Array.isArray(rawAny?.output)
          ? (rawAny.output as Array<{ content?: Array<{ text?: string }> }>)
              .flatMap((o) => o?.content ?? [])
              .map((c) => c?.text ?? "")
              .join("")
          : "";

    if (!content) {
      console.warn(`[generateOutreachEmail] empty output on attempt ${attempt + 1}, retrying...`);
      continue;
    }

    // Strip markdown code fences if model wraps output
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: { subject?: string; body?: string };
    try {
      parsed = parseJsonRobust(stripped);
    } catch {
      console.warn(`[generateOutreachEmail] JSON parse failed on attempt ${attempt + 1}, retrying...`);
      continue;
    }

    const subject  = String(parsed?.subject ?? "").trim();
    const gptBody  = String(parsed?.body ?? "").trim();
    if (!subject || !gptBody) {
      console.warn(`[generateOutreachEmail] missing subject/body on attempt ${attempt + 1}, retrying...`);
      continue;
    }

    // Strip any GPT signature/CTA attempt, then append system-locked CTA + signature
    const body = assembleEmail(gptBody);

    const hash = computeBodyHash(body);
    if (existingHashes.has(hash)) continue;

    return { subject, body, hash, messageType, messageVersionHash };
  }

  throw new Error("Could not generate unique email after max attempts");
}

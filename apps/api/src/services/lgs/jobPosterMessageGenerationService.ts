import crypto from "crypto";
import { getOpenAiClient } from "@/src/lib/openai";
import { computeBodyHash } from "./outreachHashService";

export type JobPosterMessageInput = {
  companyName?: string | null;
  contactName?: string | null;
  city?: string | null;
  category?: string | null;
};

export type JobPosterMessageOutput = {
  subject: string;
  body: string;
  hash: string;
  messageVersionHash: string;
};

const MODEL = "gpt-5-nano";
const MESSAGE_VERSION = "job-poster-v1";
const MAX_OUTPUT_TOKENS = 420;

function getGreetingName(input: JobPosterMessageInput): string {
  if (input.contactName?.trim()) return input.contactName.trim();
  if (input.companyName?.trim()) return input.companyName.trim();
  return "there";
}

function buildPrompt(input: JobPosterMessageInput): string {
  const city = input.city?.trim() || "your area";
  const name = getGreetingName(input);
  const category = input.category?.trim() ? input.category.replace(/_/g, " ") : "local businesses";

  return `
Write a short outreach email to a potential job poster or business that may need contractor help.

Context:
- Recipient: ${name}
- Company: ${input.companyName?.trim() || "their business"}
- City: ${city}
- Category: ${category}

About 8Fold:
- 8Fold helps job posters connect with reliable local contractors.
- We focus on fast routing, clear communication, and dependable project fulfillment.

Goal:
- Ask whether they ever need contractor help for upcoming work.
- Keep it human, direct, and low-pressure.
- Generate a fresh variation each time.

Requirements:
- Under 120 words
- Sound observant and specific, not salesy
- Do not ask for a meeting or call
- Do not use generic openers like "I hope you're doing well"
- Mention 8Fold naturally
- End with a simple invitation to reply if contractor support would be useful

Output:
Return only the email body in plain text.
`;
}

function buildSubject(input: JobPosterMessageInput): string {
  const city = input.city?.trim();
  if (city) return `Contractor support in ${city}`;
  return "Quick question about contractor coverage";
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function generateJobPosterMessage(input: JobPosterMessageInput): Promise<JobPosterMessageOutput> {
  const openai = getOpenAiClient();
  const raw = (await openai.responses.create({
    model: MODEL,
    input: buildPrompt(input),
    reasoning: { effort: "minimal" },
    text: { verbosity: "low", format: { type: "text" } },
    max_output_tokens: MAX_OUTPUT_TOKENS,
  })) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };

  const text =
    raw.output_text ||
    raw.output?.[0]?.content?.[0]?.text ||
    "";

  if (!text.trim()) {
    throw new Error("empty_job_poster_generation");
  }

  const body = textToHtml(text);

  return {
    subject: buildSubject(input),
    body,
    hash: computeBodyHash(body),
    messageVersionHash: crypto.createHash("sha256").update(MESSAGE_VERSION).digest("hex").slice(0, 16),
  };
}

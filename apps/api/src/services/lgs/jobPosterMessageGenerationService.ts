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
const MESSAGE_VERSION = "job-poster-v2";
const MAX_OUTPUT_TOKENS = 420;

function getGreetingName(input: JobPosterMessageInput): string {
  if (input.contactName?.trim()) return input.contactName.trim();
  if (input.companyName?.trim()) return input.companyName.trim();
  return "there";
}

function buildPrompt(input: JobPosterMessageInput): string {
  const city = input.city?.trim() || "your area";
  const name = getGreetingName(input);
  const company = input.companyName?.trim() || "their business";
  const category = input.category?.trim() ? input.category.replace(/_/g, " ") : "general";

  return `
Write a short, natural outreach email to a potential job poster (property manager, business, or homeowner).

Context:
- Recipient: ${name}
- Company: ${company}
- City: ${city}
- Category: ${category}

Tone:
- Human
- Conversational
- Confident but not pushy
- Not robotic or corporate

Subject:
- Catch attention
- Mention contractors, help, or availability
- Avoid generic phrases like "support" or "services"

Body structure:
1. Open naturally with "Hi ${name}," when a recipient name is available, otherwise "Hi ${company} team,"
2. Quick intro: "I'm Brad from 8Fold."
3. What we do, simple and clear: "We connect people with reliable local contractors in ${city} for day-to-day jobs and projects."
4. Light relevance: mention maintenance, repairs, or one-off jobs naturally.
5. Value: explain that 8Fold can quickly match them with someone solid without the usual back-and-forth.
6. Pricing angle: mention they can also post jobs on 8Fold with flexible pricing depending on what they need.
7. Soft encouragement: invite them to check out https://8fold.app and create a free account if they want to see how it works.
8. Soft close: "No pressure—just figured I'd reach out in case it's useful."
9. CTA: "Happy to help whenever you need it."
10. Include this exact signature:
Best,
Brad Johnson
Chief Operations Officer
info@8fold.app
https://8fold.app

Rules:
- Keep the full email under 150 words
- No fluff
- No buzzwords
- No "we'd love to" language
- Do not ask for a call, meeting, or chat
- Make it feel like a real person typed it in under a minute
- Return only the email body in plain text
`;
}

function buildSubject(input: JobPosterMessageInput): string {
  const company = input.companyName?.trim();
  const category = input.category?.trim()?.replace(/_/g, " ").toLowerCase();

  if (category?.includes("property")) return "Contractors available for your property";
  if (category?.includes("moving")) return "Extra contractor help when you need it";
  if (category?.includes("construction")) return "Contractors available for upcoming jobs";
  if (company) return `Contractors available for ${company}`;
  return "Trade contractors available if needed";
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

function stripSubjectLine(text: string): string {
  return text.replace(/^subject:\s.*(?:\r?\n)+/i, "").trim();
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

  const body = textToHtml(stripSubjectLine(text) || text);

  return {
    subject: buildSubject(input),
    body,
    hash: computeBodyHash(body),
    messageVersionHash: crypto.createHash("sha256").update(MESSAGE_VERSION).digest("hex").slice(0, 16),
  };
}

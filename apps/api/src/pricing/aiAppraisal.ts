import { getTradeDelta } from "./tradeDeltas";
import { GPT_MODEL } from "@8fold/shared";
import type { JobType, TradeCategory } from "../types/dbEnums";
import crypto from "node:crypto";

const MODEL = GPT_MODEL;
const MAX_REASONABLE_THRESHOLD_CENTS = 5_000_000;

export type PriceAppraisalInput = {
  tradeCategory: TradeCategory;
  jobType: JobType;
  city: string;
  province: string;
  scope: string;
  title: string;
  junkHaulingItems?: Array<{
    category: string;
    item: string;
    quantity: number;
    notes?: string;
  }>;
};

export type PriceAppraisalResult = {
  priceMedianCents: number;
  allowedDeltaCents: number;
  reasoning: string;
};

export class AiAppraisalError extends Error {
  code: "AI_CONFIG_MISSING" | "AI_RESPONSE_INVALID" | "AI_RUNTIME_ERROR";
  traceId: string;
  status: 500 | 502;
  rawResponse?: unknown;
  constructor(args: {
    message: string;
    code: "AI_CONFIG_MISSING" | "AI_RESPONSE_INVALID" | "AI_RUNTIME_ERROR";
    traceId: string;
    status: 500 | 502;
    rawResponse?: unknown;
  }) {
    super(args.message);
    this.name = "AiAppraisalError";
    this.code = args.code;
    this.traceId = args.traceId;
    this.status = args.status;
    this.rawResponse = args.rawResponse;
  }
}

function fail(args: {
  message: string;
  code: "AI_CONFIG_MISSING" | "AI_RESPONSE_INVALID" | "AI_RUNTIME_ERROR";
  status: 500 | 502;
  rawResponse?: unknown;
}): never {
  throw new AiAppraisalError({
    message: args.message,
    code: args.code,
    status: args.status,
    traceId: crypto.randomUUID(),
    rawResponse: args.rawResponse,
  });
}

function buildAppraisalPrompt(input: PriceAppraisalInput): string {
  const junkItemsText = input.junkHaulingItems && input.junkHaulingItems.length > 0
    ? `\nJunk hauling items:\n${input.junkHaulingItems.map(item =>
      `- ${item.category}: ${item.item} (qty ${item.quantity})${item.notes ? ` — ${item.notes}` : ""}`
    ).join("\n")}`
    : "";

  return `You are a professional pricing appraiser for 8Fold Local, a marketplace for local service jobs.

Given the following job details:
- Trade: ${input.tradeCategory}
- Job type: ${input.jobType} (${input.jobType === "urban" ? "urban tasks assume contractors are nearby, max 50km/30mi" : "regional tasks allow longer travel, max 100km/60mi"})
- Location: ${input.city}, ${input.province}
- Title: ${input.title}
- Scope: ${input.scope}${junkItemsText}

Return a JSON object with:
- "price_median": The median price in cents (integer) that similar jobs in this location typically command
- "reasoning": A brief one-line explanation (max 100 characters) of why this price was chosen

Consider:
- Local market rates for ${input.tradeCategory} in ${input.city}, ${input.province}
- Job complexity based on scope
- ${input.jobType === "urban" ? "Urban pricing (contractors nearby)" : "Regional pricing (longer travel expected)"}
${input.junkHaulingItems && input.junkHaulingItems.length > 0 ? "- Volume and type of items to haul" : ""}

Return ONLY valid JSON, no markdown, no code blocks. Example:
{"price_median": 45000, "reasoning": "Based on 187 similar drywall jobs in Vancouver over last 90 days"}`;
}

/**
 * Appraise job price using GPT-5 nano.
 * Hard-fails on config/runtime/invalid-model-output conditions.
 */
export async function appraiseJobPrice(
  input: PriceAppraisalInput
): Promise<PriceAppraisalResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    fail({
      message: "AI appraisal system configuration error.",
      code: "AI_CONFIG_MISSING",
      status: 500,
    });
  }

  const prompt = buildAppraisalPrompt(input);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are a professional pricing appraiser. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      const rawResponse = await resp.json().catch(() => ({}));
      fail({
        message: String(rawResponse?.error?.message || "OpenAI request failed"),
        code: "AI_RUNTIME_ERROR",
        status: 502,
        rawResponse,
      });
    }

    const rawResponse = await resp.json();
    const content = rawResponse?.choices?.[0]?.message?.content;
    if (!content) {
      fail({
        message: "AI appraisal returned empty content.",
        code: "AI_RESPONSE_INVALID",
        status: 502,
        rawResponse,
      });
    }

    const cleaned = String(content).replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      fail({
        message: "AI appraisal returned non-JSON content.",
        code: "AI_RESPONSE_INVALID",
        status: 502,
        rawResponse: content,
      });
    }

    const priceMedianCents = Number(parsed?.price_median);
    const reasoning = String(parsed?.reasoning ?? "").slice(0, 200);

    const invalid =
      !Number.isFinite(priceMedianCents) ||
      priceMedianCents <= 0 ||
      priceMedianCents >= MAX_REASONABLE_THRESHOLD_CENTS;

    if (invalid) {
      fail({
        message: "AI appraisal returned an invalid result.",
        code: "AI_RESPONSE_INVALID",
        status: 502,
        rawResponse: parsed,
      });
    }

    return {
      priceMedianCents: Math.round(priceMedianCents),
      allowedDeltaCents: getTradeDelta(input.tradeCategory),
      reasoning: reasoning || "AI-generated pricing",
    };
  } catch (err) {
    if (err instanceof AiAppraisalError) throw err;
    fail({
      message: "AI appraisal service failure.",
      code: "AI_RUNTIME_ERROR",
      status: 502,
      rawResponse: err,
    });
  }
}

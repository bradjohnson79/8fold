import { getTradeDelta } from "./tradeDeltas";
import { GPT_MODEL } from "@8fold/shared";
import type { JobType, TradeCategory } from "../types/dbEnums";

const MODEL = GPT_MODEL;

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

/**
 * Fallback pricing when AI fails (trade-based defaults)
 */
const FALLBACK_PRICES: Partial<Record<TradeCategory, number>> = {
  JUNK_REMOVAL: 330_00,
  PLUMBING: 250_00,
  DRYWALL: 450_00,
  JANITORIAL_CLEANING: 180_00,
  PAINTING: 420_00,
  ELECTRICAL: 275_00,
  LANDSCAPING: 350_00,
  APPLIANCE: 225_00,
};

function getFallbackPrice(tradeCategory: TradeCategory): number {
  return FALLBACK_PRICES[tradeCategory] ?? 300_00; // Default $300
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
 * Appraise job price using GPT-5 nano
 */
export async function appraiseJobPrice(
  input: PriceAppraisalInput
): Promise<PriceAppraisalResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Fallback if API key missing
    const fallbackPrice = getFallbackPrice(input.tradeCategory);
    const delta = getTradeDelta(input.tradeCategory);
    return {
      priceMedianCents: fallbackPrice,
      allowedDeltaCents: delta,
      reasoning: "Fallback pricing (OpenAI API key not configured)",
    };
  }

  const prompt = buildAppraisalPrompt(input);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
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
        temperature: 0.3, // Lower temperature for more consistent pricing
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json?.error?.message || "OpenAI request failed");
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    // Parse JSON response (may be wrapped in markdown code blocks)
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const priceMedianCents = Math.round(Number(parsed.price_median));
    const reasoning = String(parsed.reasoning || "").slice(0, 200); // Cap at 200 chars

    if (!Number.isFinite(priceMedianCents) || priceMedianCents <= 0) {
      throw new Error("Invalid price_median in response");
    }

    const allowedDeltaCents = getTradeDelta(input.tradeCategory);

    return {
      priceMedianCents,
      allowedDeltaCents,
      reasoning: reasoning || "AI-generated pricing",
    };
  } catch (err) {
    // Fallback on any error
    const fallbackPrice = getFallbackPrice(input.tradeCategory);
    const delta = getTradeDelta(input.tradeCategory);
    console.error("[aiAppraisal] Error, using fallback:", err);
    return {
      priceMedianCents: fallbackPrice,
      allowedDeltaCents: delta,
      reasoning: `Fallback pricing (error: ${err instanceof Error ? err.message : "unknown"})`,
    };
  }
}

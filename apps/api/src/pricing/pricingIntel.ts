import { z } from "zod";
import { GPT_MODEL } from "@8fold/shared";
import { loadRootEnvOnce } from "../config/loadRootEnv";
import type { JobType, TradeCategory } from "../types/dbEnums";

export const PricingIntelSchema = z.object({
  suggestedMin: z.number(),
  suggestedMax: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.array(z.string()).max(20),
  notes: z.string()
});
export type PricingIntel = z.infer<typeof PricingIntelSchema>;

function roundToDollarsStep(n: number, step: number): number {
  if (!Number.isFinite(n)) return 0;
  if (step <= 0) return Math.round(n);
  return Math.round(n / step) * step;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Advisory-only pricing intelligence for Job Posting.
 *
 * Returns dollars (not cents). Never authoritative; never blocks job posting.
 */
export async function getPricingIntel(opts: {
  tradeCategory: TradeCategory;
  jobType: JobType; // urban | regional
  city: string;
  stateProvince: string;
  country: "US" | "CA";
  title: string;
  scope: string;
  // Current platform does not capture this yet; keep explicit and conservative.
  propertyType?: "residential" | "commercial" | "unknown";
  // Anchor the range to the already-computed median when available (keeps suggestions conservative).
  anchorMedianCents?: number | null;
}): Promise<{ model: string; intel: PricingIntel } | null> {
  loadRootEnvOnce();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = GPT_MODEL;
  const anchorDollars =
    typeof opts.anchorMedianCents === "number" && Number.isFinite(opts.anchorMedianCents)
      ? Math.max(0, Math.round(opts.anchorMedianCents / 100))
      : null;

  const propertyType = opts.propertyType ?? "unknown";

  const prompt = [
    "You are a pricing intelligence advisor for 8Fold Local job posting.",
    "You do NOT set prices. You ONLY suggest a conservative range so a human can decide.",
    "",
    "Rules (strict):",
    "- Output MUST be strict JSON only, matching the schema provided.",
    "- suggestedMin and suggestedMax are NUMBERS in USD/CAD dollars (no cents), rounded to sensible intervals (25 or 50).",
    "- Use local averages and typical jobs, NOT extremes.",
    "- Be conservative. If data is limited, set confidence=low and explain in notes.",
    "- suggestedMin must be < suggestedMax.",
    "- assumptions must be a short list of concrete bullet strings (no prose paragraphs), including:",
    "  - trade category / job type signals used",
    "  - property type (if unknown, explicitly state the assumption)",
    "  - geography granularity (city/state/province) used for the estimate",
    "  - any scope uncertainty",
    "- notes must be short, neutral, and non-conversational (no marketing tone).",
    "",
    "Input context:",
    `- tradeCategory: ${opts.tradeCategory}`,
    `- country: ${opts.country}`,
    `- stateProvince: ${opts.stateProvince}`,
    `- city: ${opts.city}`,
    `- jobType: ${opts.jobType} (${opts.jobType === "urban" ? "urban" : "regional"})`,
    `- propertyType: ${propertyType}`,
    `- title: ${opts.title}`,
    `- scopeSummary: ${opts.scope}`,
    anchorDollars ? `- anchorMedianDollars: ${anchorDollars}` : "- anchorMedianDollars: (none)",
    "",
    "Return JSON with exactly these keys:",
    '{ "suggestedMin": number, "suggestedMax": number, "confidence": "low"|"medium"|"high", "assumptions": string[], "notes": string }'
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 600
    })
  });

  const raw = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    // Advisory-only: fail open (no blocking).
    console.warn("[pricingIntel] OpenAI request failed:", raw?.error?.message || resp.status);
    return null;
  }

  const text: string =
    typeof raw?.output_text === "string"
      ? raw.output_text
      : Array.isArray(raw?.output)
        ? raw.output
            .flatMap((o: any) => o?.content ?? [])
            .map((c: any) => c?.text)
            .filter((t: any) => typeof t === "string")
            .join("\n")
        : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn("[pricingIntel] Invalid JSON output");
    return null;
  }

  const val = PricingIntelSchema.safeParse(parsed);
  if (!val.success) {
    console.warn("[pricingIntel] Invalid schema output");
    return null;
  }

  const step = anchorDollars && anchorDollars >= 500 ? 50 : 25;
  const min = roundToDollarsStep(val.data.suggestedMin, step);
  const max = roundToDollarsStep(val.data.suggestedMax, step);

  // Post-process for safety: clamp, ensure ordering, avoid extremes.
  const safeMin = clamp(min, 50, 20_000);
  const safeMax = clamp(max, 75, 25_000);
  const ordered =
    safeMax > safeMin
      ? { suggestedMin: safeMin, suggestedMax: safeMax }
      : { suggestedMin: safeMin, suggestedMax: safeMin + step };

  const intel: PricingIntel = {
    ...val.data,
    ...ordered,
    assumptions: (val.data.assumptions ?? []).map((s) => String(s).slice(0, 180)).filter(Boolean),
    notes: String(val.data.notes ?? "").slice(0, 500)
  };

  // Keep range anchored if anchor exists (conservative guardrail, not authoritative).
  if (anchorDollars && Number.isFinite(anchorDollars)) {
    const anchorMin = clamp(roundToDollarsStep(anchorDollars * 0.8, step), 50, 20_000);
    const anchorMax = clamp(roundToDollarsStep(anchorDollars * 1.25, step), 75, 25_000);
    intel.suggestedMin = clamp(intel.suggestedMin, anchorMin, anchorMax - step);
    intel.suggestedMax = clamp(intel.suggestedMax, intel.suggestedMin + step, anchorMax);
  }

  return { model, intel };
}


import crypto from "node:crypto";
import { TradeCategoryLabel, formatStateProvince } from "@8fold/shared";
import { getOpenAiClient, OPENAI_APPRAISAL_MODEL } from "../lib/openai";

export type JobPricingAppraisalInput = {
  title: string;
  tradeCategory: string;
  city: string;
  stateProvince: string;
  country: "US" | "CA";
  currency: "USD" | "CAD";
  jobType?: "urban" | "regional";
  estimatedDurationHours: number | null;
  description: string;
  items?: Array<{ category: string; description: string; quantity: number; notes?: string }>;
  propertyType: "residential" | "commercial" | "unknown";
  currentTotalDollars: number;
};

export type JobPricingAppraisalOutputStrict = {
  suggestedTotal: number;
  currency: "USD" | "CAD";
  confidence: number;
  priceRange: { low: number; high: number };
  reasoning: string;
  isOutlier: boolean;
};

export class JobPricingAppraisalError extends Error {
  code: "AI_CONFIG_MISSING" | "AI_RUNTIME_ERROR" | "AI_INVALID_RESPONSE";
  traceId: string;
  status: 500;
  raw?: unknown;

  constructor(args: {
    message: string;
    code: "AI_CONFIG_MISSING" | "AI_RUNTIME_ERROR" | "AI_INVALID_RESPONSE";
    traceId: string;
    status: 500;
    raw?: unknown;
  }) {
    super(args.message);
    this.name = "JobPricingAppraisalError";
    this.code = args.code;
    this.traceId = args.traceId;
    this.status = args.status;
    this.raw = args.raw;
  }
}

function fail(args: {
  message: string;
  code: "AI_CONFIG_MISSING" | "AI_RUNTIME_ERROR" | "AI_INVALID_RESPONSE";
  raw?: unknown;
}): never {
  throw new JobPricingAppraisalError({
    message: args.message,
    code: args.code,
    traceId: crypto.randomUUID(),
    status: 500,
    raw: args.raw,
  });
}

/**
 * GPT-5 nano job pricing appraisal (advisory only).
 * Returns strict JSON with numeric confidence (0..1).
 */
export async function appraiseJobTotalWithAi(
  input: JobPricingAppraisalInput
): Promise<{ model: string; output: JobPricingAppraisalOutputStrict; raw: unknown }> {
  const key = process.env.OPEN_AI_API_KEY;
  if (!key) fail({ message: "OPEN_AI_API_KEY missing in API runtime", code: "AI_CONFIG_MISSING" });

  const model = OPENAI_APPRAISAL_MODEL;

  const stateFull = formatStateProvince(input.stateProvince);
  const countryFull = input.country === "CA" ? "Canada" : "United States";
  const tradeRaw = String(input.tradeCategory ?? "").trim();
  const tradeName = String((TradeCategoryLabel as any)?.[tradeRaw] ?? tradeRaw.replace(/_/g, " ")).trim();
  const jobTypeName = input.jobType === "regional" ? "Regional" : input.jobType === "urban" ? "Urban" : "";

  const itemLines =
    Array.isArray(input.items) && input.items.length
      ? input.items
          .map((it) => {
            const cat = String(it?.category ?? "").trim();
            const desc = String(it?.description ?? "").trim();
            const qty = Number(it?.quantity);
            const notes = String(it?.notes ?? "").trim();
            if (!cat || !desc || !Number.isFinite(qty) || qty < 1) return null;
            return `${cat} – ${desc} – ${Math.round(qty)}${notes ? ` – ${notes}` : ""}`;
          })
          .filter(Boolean)
      : [];

  const cleanBlockLines: string[] = [];
  cleanBlockLines.push("Job Location:");
  if (stateFull) cleanBlockLines.push(stateFull);
  cleanBlockLines.push(countryFull);

  if (tradeName) {
    cleanBlockLines.push("");
    cleanBlockLines.push("Trade Category:");
    cleanBlockLines.push(tradeName);
  }

  if (jobTypeName) {
    cleanBlockLines.push("");
    cleanBlockLines.push("Job Type:");
    cleanBlockLines.push(jobTypeName);
  }

  const scope = String(input.description ?? "").trim();
  if (scope) {
    cleanBlockLines.push("");
    cleanBlockLines.push("Job Description:");
    cleanBlockLines.push(scope);
  }

  if (itemLines.length) {
    cleanBlockLines.push("");
    cleanBlockLines.push("Job Items:");
    for (const l of itemLines) cleanBlockLines.push(l as string);
  }
  const cleanBlock = cleanBlockLines.join("\n").trim();

  const prompt = [
    "You are a pricing intelligence system for 8Fold Local.",
    "Goal: determine a fair, conservative market price for this job based on typical local contractor rates.",
    "Avoid inflated or luxury pricing. Use averages, not extremes.",
    "",
    "Rules (strict):",
    "- Output MUST be strict JSON only (no markdown, no prose outside JSON).",
    "- All money numbers are whole dollars (no cents).",
    "- currency MUST match the provided currency exactly.",
    "- confidence MUST be a number from 0 to 1.",
    "- suggestedTotal must be within priceRange.low..priceRange.high.",
    "- priceRange.low must be < priceRange.high.",
    "- If data is limited, set confidence closer to 0 (e.g., 0.25) and explain briefly in reasoning.",
    "- isOutlier: true if currentTotal is meaningfully outside typical market pricing for this job + region.",
    "",
    "Required JSON shape:",
    '{ "suggestedTotal": 425, "currency": "USD", "confidence": 0.84, "priceRange": { "low": 350, "high": 500 }, "reasoning": "…", "isOutlier": true }',
    "",
    `Currency: ${input.currency}`,
    `Current baseline total (dollars): ${input.currentTotalDollars}`,
    "",
    "Job input (verbatim):",
    cleanBlock,
  ].join("\n");

  let raw: any;
  try {
    raw = (await getOpenAiClient().responses.create({
      model,
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 600,
    })) as any;
  } catch (err) {
    fail({ message: "OpenAI runtime call failed", code: "AI_RUNTIME_ERROR", raw: err });
  }

  const text = typeof raw?.output_text === "string" ? raw.output_text : "";
  if (!text) {
    fail({ message: "AI returned empty output", code: "AI_INVALID_RESPONSE", raw });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail({ message: "AI output is not strict JSON", code: "AI_INVALID_RESPONSE", raw: text });
  }

  const suggestedTotal = Number(parsed?.suggestedTotal);
  const lowRange = Number(parsed?.priceRange?.low);
  const highRange = Number(parsed?.priceRange?.high);
  const confidence = Number(parsed?.confidence);
  const currency = String(parsed?.currency ?? "").toUpperCase();
  const reasoning = String(parsed?.reasoning ?? "");
  const isOutlier = Boolean(parsed?.isOutlier);

  const invalid =
    !Number.isFinite(suggestedTotal) ||
    !Number.isFinite(lowRange) ||
    !Number.isFinite(highRange) ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1;

  if (invalid) {
    fail({ message: "AI output failed strict validation", code: "AI_INVALID_RESPONSE", raw: parsed });
  }
  if (currency !== "USD" && currency !== "CAD") {
    fail({ message: "AI output currency invalid", code: "AI_INVALID_RESPONSE", raw: parsed });
  }
  if (currency !== input.currency) {
    fail({ message: "AI output currency mismatch", code: "AI_INVALID_RESPONSE", raw: parsed });
  }

  const output: JobPricingAppraisalOutputStrict = {
    suggestedTotal,
    currency: currency as "USD" | "CAD",
    confidence,
    priceRange: { low: lowRange, high: highRange },
    reasoning,
    isOutlier,
  };

  return { model, output, raw: parsed };
}


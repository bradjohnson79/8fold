import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";

export type ConfidenceLabel = "LOW" | "MEDIUM" | "HIGH";

type ConfidenceInputs = {
  title: string;
  description: string;
  tradeCategory: string;
  median: number;
  low: number;
  high: number;
};

type RangeInputs = {
  title: string;
  description: string;
  tradeCategory: string;
  median: number;
  isRegionalRequested?: boolean;
};

export type AppraisalConfidenceBreakdown = {
  descriptionScore: number;
  categoryConfidence: number;
  durationConfidence: number;
  spreadScore: number;
  spreadRatio: number;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizedText(input: { title: string; description: string }) {
  return `${String(input.title ?? "").trim()} ${String(input.description ?? "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function computeDescriptionScore(input: { title: string; description: string }): number {
  const text = normalizedText(input);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  let baseScore = 0.2;
  if (wordCount >= 40) baseScore = 1;
  else if (wordCount >= 28) baseScore = 0.88;
  else if (wordCount >= 18) baseScore = 0.72;
  else if (wordCount >= 10) baseScore = 0.52;
  else if (wordCount >= 5) baseScore = 0.35;

  const specificityMatches = text.match(
    /\b(\d+|sq\s*ft|square\s*feet|bedroom|bathroom|boxes?|items?|rooms?|stairs?|floor|floors?|appliances?|fixtures?|outlets?|panels?|fence|gate|yard|roof|drywall|paint|haul|install|replace|repair|assemble|move|pickup|remove|truck|same day|today|tomorrow|weekend)\b/g,
  );
  const specificityScore = clamp((specificityMatches?.length ?? 0) / 8);

  const vaguePenaltyMatches = text.match(
    /\b(not sure|unsure|maybe|some stuff|stuff|misc|miscellaneous|general help|help needed|various|whatever|etc)\b/g,
  );
  const vaguePenalty = Math.min(0.35, (vaguePenaltyMatches?.length ?? 0) * 0.12);

  return round2(clamp(baseScore * 0.7 + specificityScore * 0.3 - vaguePenalty));
}

export function computeCategoryConfidence(tradeCategory: string): number {
  const category = String(tradeCategory ?? "").trim().toUpperCase();
  if (!TRADE_CATEGORIES_CANONICAL.includes(category as (typeof TRADE_CATEGORIES_CANONICAL)[number])) {
    return 0.15;
  }

  if (["PLUMBING", "ELECTRICAL", "HVAC", "HANDYMAN", "MOVING", "JUNK_REMOVAL", "FURNITURE_ASSEMBLY", "PAINTING", "DRYWALL", "CARPENTRY"].includes(category)) {
    return 0.9;
  }

  if (["APPLIANCE", "ROOFING", "LANDSCAPING", "FENCING", "JANITORIAL_CLEANING"].includes(category)) {
    return 0.72;
  }

  if (["SNOW_REMOVAL", "AUTOMOTIVE", "WELDING"].includes(category)) {
    return 0.55;
  }

  return 0.35;
}

export function computeDurationConfidence(input: { title: string; description: string }): number {
  const text = normalizedText(input);
  const explicitTime = /\b(\d+(\.\d+)?\s*(hour|hours|hr|hrs|day|days|week|weeks)|half day|full day|same day|two day|multi day)\b/.test(text);
  const scopeCount = (text.match(/\b(\d+|boxes?|items?|rooms?|bedrooms?|bathrooms?|stairs?|floors?|loads?|fixtures?|outlets?|windows?|doors?)\b/g) ?? []).length;
  const vague = /\b(not sure|unsure|maybe|estimate needed|some stuff|whatever|general help)\b/.test(text);

  if (explicitTime) return 1;
  if (scopeCount >= 4) return 0.82;
  if (scopeCount >= 2) return 0.62;
  if (vague) return 0.18;
  return text.split(/\s+/).filter(Boolean).length >= 18 ? 0.48 : 0.3;
}

export function computeSpreadScore(low: number, high: number, median: number): { spreadRatio: number; spreadScore: number } {
  const safeMedian = Number(median);
  if (!Number.isFinite(safeMedian) || safeMedian <= 0) {
    return { spreadRatio: 1, spreadScore: 0.1 };
  }

  const spreadRatio = Math.max(0, Number(high) - Number(low)) / safeMedian;
  if (spreadRatio < 0.3) return { spreadRatio: round2(spreadRatio), spreadScore: 1 };
  if (spreadRatio <= 0.6) return { spreadRatio: round2(spreadRatio), spreadScore: 0.6 };
  return { spreadRatio: round2(spreadRatio), spreadScore: 0.1 };
}

export function deriveDynamicPriceRange(input: RangeInputs): { low: number; high: number; spreadRatio: number } {
  const descriptionScore = computeDescriptionScore(input);
  const categoryConfidence = computeCategoryConfidence(input.tradeCategory);
  const durationConfidence = computeDurationConfidence(input);

  let spreadRatio = 0.22;
  if (descriptionScore < 0.7) spreadRatio += 0.08;
  if (descriptionScore < 0.45) spreadRatio += 0.16;
  if (durationConfidence < 0.6) spreadRatio += 0.08;
  if (durationConfidence < 0.35) spreadRatio += 0.14;
  if (categoryConfidence < 0.6) spreadRatio += 0.08;
  if (categoryConfidence < 0.3) spreadRatio += 0.12;
  if (input.isRegionalRequested) spreadRatio += 0.04;

  spreadRatio = clamp(spreadRatio, 0.18, 0.8);

  const median = Math.max(50, Math.round(Number(input.median) || 0));
  const halfSpread = spreadRatio / 2;
  const low = Math.max(50, Math.round((median * (1 - halfSpread)) / 5) * 5);
  const high = Math.max(low + 5, Math.round((median * (1 + halfSpread)) / 5) * 5);

  return { low, high, spreadRatio: round2((high - low) / median) };
}

export function computeAppraisalConfidence(inputs: ConfidenceInputs): AppraisalConfidenceBreakdown {
  const descriptionScore = computeDescriptionScore(inputs);
  const categoryConfidence = computeCategoryConfidence(inputs.tradeCategory);
  const durationConfidence = computeDurationConfidence(inputs);
  const { spreadRatio, spreadScore } = computeSpreadScore(inputs.low, inputs.high, inputs.median);

  const confidenceScore = round2(
    clamp(
      descriptionScore * 0.3 +
        categoryConfidence * 0.3 +
        durationConfidence * 0.2 +
        spreadScore * 0.2,
    ),
  );

  const confidenceLabel: ConfidenceLabel =
    confidenceScore >= 0.75 ? "HIGH" : confidenceScore >= 0.5 ? "MEDIUM" : "LOW";

  return {
    descriptionScore,
    categoryConfidence,
    durationConfidence,
    spreadScore,
    spreadRatio,
    confidenceScore,
    confidenceLabel,
  };
}

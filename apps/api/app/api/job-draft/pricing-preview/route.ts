import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireJobPoster } from "@/src/auth/rbac";
import { resolve as resolveTax } from "@/src/services/v4/taxResolver";

export const runtime = "nodejs";

const BodySchema = z.object({
  country: z.enum(["US", "CA"]),
  province: z.string().trim().max(50).optional().default(""),
  tradeCategory: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
});

type Confidence = "LOW" | "MEDIUM" | "HIGH";

type PricingPreview = {
  low: number;
  median: number;
  high: number;
  confidence: Confidence;
  taxRate: number;
  currency: "USD" | "CAD";
  appraisalToken: string;
  modelUsed: string;
  usedFallback: boolean;
};

const CANADA_PROVINCE_ALIASES: Record<string, string> = {
  AB: "AB",
  ALBERTA: "AB",
  BC: "BC",
  "BRITISH COLUMBIA": "BC",
  MB: "MB",
  MANITOBA: "MB",
  NB: "NB",
  "NEW BRUNSWICK": "NB",
  NL: "NL",
  "NEWFOUNDLAND AND LABRADOR": "NL",
  NS: "NS",
  "NOVA SCOTIA": "NS",
  NT: "NT",
  "NORTHWEST TERRITORIES": "NT",
  NU: "NU",
  NUNAVUT: "NU",
  ON: "ON",
  ONTARIO: "ON",
  PE: "PE",
  "PRINCE EDWARD ISLAND": "PE",
  QC: "QC",
  QUEBEC: "QC",
  SK: "SK",
  SASKATCHEWAN: "SK",
  YT: "YT",
  YUKON: "YT",
};

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

function parseJsonLoose(rawText: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(rawText.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeConfidence(value: unknown): Confidence {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "LOW" || text === "MEDIUM" || text === "HIGH") return text;
  return "LOW";
}

function fallback(currency: "USD" | "CAD", taxRate: number): PricingPreview {
  return {
    low: 100,
    median: 200,
    high: 300,
    confidence: "LOW",
    taxRate,
    currency,
    appraisalToken: randomUUID(),
    modelUsed: "fallback",
    usedFallback: true,
  };
}

function normalizeAppraisal(parsed: Record<string, unknown> | null, currency: "USD" | "CAD", taxRate: number): PricingPreview {
  if (!parsed) return fallback(currency, taxRate);

  let low = roundToNearestFive(toInt(parsed.low));
  let median = roundToNearestFive(toInt(parsed.median));
  let high = roundToNearestFive(toInt(parsed.high));

  if (!Number.isFinite(low) || !Number.isFinite(median) || !Number.isFinite(high)) {
    return fallback(currency, taxRate);
  }

  low = Math.max(50, low);
  median = Math.max(55, median);
  high = Math.max(60, high);

  if (low >= median) median = low + 5;
  if (median >= high) high = median + 5;

  return {
    low,
    median,
    high,
    confidence: normalizeConfidence(parsed.confidence),
    taxRate,
    currency,
    appraisalToken: randomUUID(),
    modelUsed: "gpt-5-nano",
    usedFallback: false,
  };
}

function normalizeProvince(country: "US" | "CA", province: string): string {
  const text = province.trim().toUpperCase();
  if (!text || country !== "CA") return text;
  return CANADA_PROVINCE_ALIASES[text] ?? text;
}

async function safeTaxRate(country: "US" | "CA", province: string): Promise<number> {
  if (country !== "CA") return 0;
  const normalizedProvince = normalizeProvince(country, province);
  if (!normalizedProvince) return 0;
  try {
    const probe = await resolveTax({
      amountCents: 10_000,
      amountKind: "NET",
      country: "CA",
      province: normalizedProvince,
      mode: "EXCLUSIVE",
    });
    return Math.max(0, Number(probe.taxCents ?? 0)) / 10_000;
  } catch (err) {
    console.warn("[pricing-preview] tax resolver failed, defaulting to 0%", {
      country,
      province: normalizedProvince,
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

function extractOutputText(raw: any): string {
  if (typeof raw?.output_text === "string") return raw.output_text;
  if (Array.isArray(raw?.output)) {
    return raw.output
      .flatMap((o: any) => o?.content ?? [])
      .map((c: any) => c?.text)
      .filter((t: any) => typeof t === "string")
      .join("\n");
  }
  return "";
}

async function runNano(input: z.infer<typeof BodySchema>): Promise<PricingPreview> {
  const currency: "USD" | "CAD" = input.country === "CA" ? "CAD" : "USD";
  const taxRate = await safeTaxRate(input.country, input.province);
  const apiKey = String(process.env.OPEN_AI_API_KEY ?? "").trim();

  if (!apiKey) {
    console.warn("[pricing-preview] OPEN_AI_API_KEY missing; using fallback appraisal");
    return fallback(currency, taxRate);
  }

  const prompt = [
    "You are a pricing appraisal engine for local trade jobs.",
    "Return strict JSON only with integer values.",
    `Country: ${input.country}`,
    `Province/State: ${normalizeProvince(input.country, input.province) || "N/A"}`,
    `Trade Category: ${input.tradeCategory}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Currency must be ${currency}.`,
    "Schema:",
    '{"low": number, "median": number, "high": number, "confidence": "LOW|MEDIUM|HIGH"}',
    "Rules:",
    "- All values must be integers in whole dollars.",
    "- Round estimates to nearest $5.",
    "- low < median < high.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        input: prompt,
        stream: false,
        reasoning: { effort: "low" },
        max_output_tokens: 350,
      }),
      signal: controller.signal,
    });

    const raw = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      console.warn("[pricing-preview] model request failed; using fallback", {
        status: response.status,
        error: raw?.error?.message ?? null,
      });
      return fallback(currency, taxRate);
    }

    const parsed = parseJsonLoose(extractOutputText(raw));
    return normalizeAppraisal(parsed, currency, taxRate);
  } catch (err) {
    console.warn("[pricing-preview] model exception; using fallback", {
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback(currency, taxRate);
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    await requireJobPoster(req);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request body",
          details: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(await runNano(parsed.data));
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

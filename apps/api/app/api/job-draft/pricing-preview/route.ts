import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getV4Readiness } from "@/src/services/v4/readinessService";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { resolve as resolveTax } from "@/src/services/v4/taxResolver";
import { badRequest, forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export const runtime = "nodejs";

const BodySchema = z.object({
  country: z.enum(["US", "CA"]),
  province: z.string().trim().min(1).max(50),
  tradeCategory: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
});

type Confidence = "LOW" | "MEDIUM" | "HIGH";

type PricingPreviewResponse = {
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

function roundToNearestFive(v: number): number {
  return Math.round(v / 5) * 5;
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
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "LOW" || v === "MEDIUM" || v === "HIGH") return v;
  return "LOW";
}

function toInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n);
}

function fallback(currency: "USD" | "CAD"): PricingPreviewResponse {
  return {
    low: 100,
    median: 200,
    high: 300,
    confidence: "LOW",
    taxRate: 0,
    currency,
    appraisalToken: randomUUID(),
    modelUsed: "fallback",
    usedFallback: true,
  };
}

function normalizeAppraisal(parsed: Record<string, unknown> | null, currency: "USD" | "CAD", taxRate: number): PricingPreviewResponse {
  if (!parsed) {
    const f = fallback(currency);
    return { ...f, taxRate };
  }

  let low = roundToNearestFive(toInt(parsed.low));
  let median = roundToNearestFive(toInt(parsed.median));
  let high = roundToNearestFive(toInt(parsed.high));

  const confidence = normalizeConfidence(parsed.confidence);

  const invalid = !Number.isFinite(low) || !Number.isFinite(median) || !Number.isFinite(high);
  if (invalid) {
    const f = fallback(currency);
    return { ...f, taxRate };
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
    confidence,
    taxRate,
    currency,
    appraisalToken: randomUUID(),
    modelUsed: "gpt-5-nano",
    usedFallback: false,
  };
}

async function runNano(input: z.infer<typeof BodySchema>): Promise<PricingPreviewResponse> {
  const apiKey = String(process.env.OPEN_AI_API_KEY ?? "").trim();
  console.log("OpenAI Key Exists:", Boolean(apiKey));
  if (!apiKey) throw badRequest("V4_APPRAISAL_KEY_MISSING", "OPEN_AI_API_KEY missing in API runtime");

  const currency: "USD" | "CAD" = input.country === "CA" ? "CAD" : "USD";
  const province = input.province.trim().toUpperCase();

  let taxRate = 0;
  if (input.country === "CA") {
    const probe = await resolveTax({
      amountCents: 10000,
      amountKind: "NET",
      country: "CA",
      province,
      mode: "EXCLUSIVE",
    });
    taxRate = Math.max(0, Number(probe.taxCents ?? 0)) / 10000;
  }

  const prompt = [
    "You are a pricing appraisal engine for local trade jobs.",
    "Return strict JSON only with integer values.",
    `Country: ${input.country}`,
    `Province/State: ${province}`,
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
    const resp = await fetch("https://api.openai.com/v1/responses", {
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

    const raw = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      throw badRequest("V4_APPRAISAL_MODEL_FAILED", String(raw?.error?.message ?? `OpenAI request failed (${resp.status})`));
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

    const parsed = parseJsonLoose(text);
    return normalizeAppraisal(parsed, currency, taxRate);
  } catch {
    const f = fallback(currency);
    return { ...f, taxRate, modelUsed: "gpt-5-nano" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const roleCheck = await requireRole(req, "JOB_POSTER");
    if (roleCheck instanceof Response) return roleCheck;

    const readiness = await getV4Readiness(roleCheck.internalUser.id);
    if (!readiness.jobPosterReady) {
      throw forbidden("V4_SETUP_REQUIRED", "Complete job poster setup before accessing the dashboard");
    }

    await rateLimitOrThrow({
      key: `v4:pricing-preview:nano:${roleCheck.internalUser.id}`,
      windowSeconds: 600,
      max: 20,
    });

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid request body",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }

    return NextResponse.json(await runNano(parsed.data));
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_PRICING_PREVIEW_FAILED");
    const retryAfter = Number((wrapped as any)?.details?.retryAfterSeconds ?? 0);
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), {
      status: wrapped.status,
      headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
    });
  }
}

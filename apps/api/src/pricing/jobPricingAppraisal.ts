import { GPT_MODEL, JobPricingAppraisalOutputSchema, TradeCategoryLabel, formatStateProvince, type JobPricingAppraisalOutput } from "@8fold/shared";

function roundToStep(n: number, step: number) {
  if (!Number.isFinite(n)) return 0;
  if (step <= 0) return Math.round(n);
  return Math.round(n / step) * step;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stripCodeFences(s: string) {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function tryParseJsonObjectFromText(text: string): unknown | null {
  const t = stripCodeFences(String(text ?? "").trim());
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    // continue
  }

  // Try to extract a JSON object substring if the model wrapped it in prose.
  const starts: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "{") starts.push(i);
  const lastClose = t.lastIndexOf("}");
  if (starts.length === 0 || lastClose < 0) return null;

  for (const start of starts) {
    if (start >= lastClose) continue;
    const candidate = t.slice(start, lastClose + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

function normalizeAppraisalCandidate(x: unknown) {
  if (typeof x === "string") {
    try {
      return normalizeAppraisalCandidate(JSON.parse(x));
    } catch {
      // Might be "JSON-like" but not strict JSON.
      // Continue below as a best-effort string parse.
    }
  }

  const parseMoneyLike = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[$,]/g, "").trim();
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
      const m = cleaned.match(/-?\d+(\.\d+)?/);
      if (m) {
        const nn = Number(m[0]);
        return Number.isFinite(nn) ? nn : null;
      }
    }
    return null;
  };

  if (x && typeof x === "object") {
    const o = x as any;
    const pr = o.priceRange ?? o.price_range ?? o.range ?? null;

    const suggestedTotal = parseMoneyLike(o.suggestedTotal ?? o.suggested_total ?? o.suggested);
    let low =
      parseMoneyLike(pr?.low ?? pr?.min) ??
      parseMoneyLike(o.priceRangeLow ?? o.price_range_low ?? o.low ?? o.suggestedMin ?? o.suggested_min);
    let high =
      parseMoneyLike(pr?.high ?? pr?.max) ??
      parseMoneyLike(o.priceRangeHigh ?? o.price_range_high ?? o.high ?? o.suggestedMax ?? o.suggested_max);

    // Handle range like "300-500"
    if ((!Number.isFinite(low ?? NaN) || !Number.isFinite(high ?? NaN)) && typeof pr === "string") {
      const nums = pr.replace(/[$,]/g, "").match(/-?\d+(\.\d+)?/g) ?? [];
      if (nums.length >= 2) {
        low = low ?? parseMoneyLike(nums[0]);
        high = high ?? parseMoneyLike(nums[1]);
      }
    }

    if (!Number.isFinite(suggestedTotal ?? NaN) || !Number.isFinite(low ?? NaN) || !Number.isFinite(high ?? NaN)) {
      return null;
    }

    const currencyRaw = String(o.currency ?? "").trim().toUpperCase();
    if (currencyRaw !== "USD" && currencyRaw !== "CAD") return null;

    let confidence = String(o.confidence ?? "").trim().toLowerCase();
    if (!confidence) confidence = "medium";
    if (confidence === "med" || confidence === "mid") confidence = "medium";
    if (confidence !== "low" && confidence !== "medium" && confidence !== "high") confidence = "medium";

    return {
      suggestedTotal: suggestedTotal!,
      currency: currencyRaw as "USD" | "CAD",
      confidence,
      priceRange: { low: low!, high: high! },
      reasoning: String(o.reasoning ?? ""),
      isOutlier: Boolean(o.isOutlier ?? o.is_outlier ?? o.outlier),
    };
  }

  // If we got here, x is probably a non-JSON string; last attempt at extracting numbers.
  if (typeof x === "string") {
    const nums = x.replace(/[$,]/g, "").match(/-?\d+(\.\d+)?/g) ?? [];
    if (nums.length >= 3) {
      const suggestedTotal = Number(nums[0]);
      const low = Number(nums[1]);
      const high = Number(nums[2]);
      if ([suggestedTotal, low, high].every((n) => Number.isFinite(n))) {
        return {
          suggestedTotal,
          currency: "USD",
          confidence: "medium",
          priceRange: { low, high },
          reasoning: x,
          isOutlier: false,
        };
      }
    }
  }

  return null;

}

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

/**
 * GPT-5 nano job pricing appraisal (advisory only).
 * Returns strict JSON per JobPricingAppraisalOutputSchema.
 */
export async function appraiseJobTotalWithAi(
  input: JobPricingAppraisalInput
): Promise<{ model: string; output: JobPricingAppraisalOutput; raw: unknown } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw Object.assign(new Error("OPENAI_API_KEY missing in API runtime"), { status: 409 });
  }

  const model = GPT_MODEL;

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
    "- suggestedTotal must be within priceRange.low..priceRange.high.",
    "- priceRange.low must be < priceRange.high.",
    "- If data is limited, set confidence=low and explain briefly in reasoning.",
    "- isOutlier: true if currentTotal is meaningfully outside typical market pricing for this job + region.",
    "",
    "Required JSON shape:",
    '{ "suggestedTotal": 425, "currency": "USD", "confidence": "high", "priceRange": { "low": 350, "high": 500 }, "reasoning": "…", "isOutlier": true }',
    "",
    `Currency: ${input.currency}`,
    `Current baseline total (dollars): ${input.currentTotalDollars}`,
    "",
    "Job input (verbatim):",
    cleanBlock,
  ].join("\n");

  async function callOnce({ timeoutMs }: { timeoutMs: number }) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
    try {
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          input: prompt,
          reasoning: { effort: "low" },
          max_output_tokens: 600,
        }),
        signal: controller.signal,
      });

      const raw = (await resp.json().catch(() => null)) as any;
      return { resp, raw };
    } catch (e) {
      const aborted = e instanceof Error && String((e as any)?.name) === "AbortError";
      if (aborted) {
        return {
          resp: new Response(null, { status: 408, statusText: "Request Timeout" }),
          raw: { error: { message: "Request timed out" } } as any,
        };
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  let parsed: unknown | null = null;
  let data: JobPricingAppraisalOutput | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { resp, raw } = await callOnce({ timeoutMs: 10_000 });

    const msg = raw?.error?.message || resp.status;
    const transient =
      resp.status === 429 ||
      resp.status === 408 ||
      resp.status >= 500 ||
      String(msg).toLowerCase().includes("processing your request");

    if (!resp.ok) {
      console.warn("[jobPricingAppraisal] OpenAI request failed:", msg);
      if (!transient || attempt === 1) return null;
      await new Promise((r) => setTimeout(r, 350));
      continue;
    }

    const text: string =
      typeof raw?.output_text === "string"
        ? raw.output_text
        : Array.isArray(raw?.output)
          ? raw.output
              .filter((o: any) => o?.type === "message")
              .flatMap((o: any) => o?.content ?? [])
              .filter((c: any) => c?.type === "output_text")
              .map((c: any) => c?.text)
              .filter((t: any) => typeof t === "string")
              .join("\n")
          : "";

    parsed = tryParseJsonObjectFromText(text);
    const normalized = parsed ? normalizeAppraisalCandidate(parsed) : null;
    const val = normalized ? JobPricingAppraisalOutputSchema.safeParse(normalized) : null;

    if (!parsed || !normalized || !val || !val.success) {
      console.warn("[jobPricingAppraisal] Invalid JSON/schema output");
      if (attempt === 1) return null;
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }

    if (val.data.currency !== input.currency) {
      console.warn("[jobPricingAppraisal] Currency mismatch:", { expected: input.currency, got: val.data.currency });
      if (attempt === 1) return null;
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }

    data = val.data;
    break;
  }

  if (!data || !parsed) return null;

  // Safety post-processing: conservative rounding + clamping.
  // LOCKED: Job Poster pricing slider uses fixed $50 increments.
  const step = 25;
  const floor = 75;
  let low = clamp(roundToStep(data.priceRange.low, step), floor, 50_000);
  let high = clamp(roundToStep(data.priceRange.high, step), low + step, 60_000);
  let suggested = clamp(roundToStep(data.suggestedTotal, step), low, high);

  // Minimum price safeguard: enforce $75 floor after reasoning, before saving.
  if (suggested < floor) suggested = floor;
  if (low < floor) low = floor;
  if (high < suggested) high = suggested;
  if (low > suggested) low = suggested;
  if (high <= low) high = low + step;

  const output: JobPricingAppraisalOutput = {
    ...data,
    suggestedTotal: suggested,
    priceRange: { low, high },
    reasoning: String(data.reasoning ?? "").slice(0, 240),
  };

  return { model, output, raw: parsed };
}


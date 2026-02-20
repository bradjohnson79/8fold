import { OPENAI_APPRAISAL_MODEL } from "../lib/openai";

export type AiDisputeAdvisoryInput = {
  dispute: {
    disputeReason: string;
    description: string;
    // Sanitized: do not include user IDs/emails/phones.
    filedByRole: "POSTER" | "CONTRACTOR" | "UNKNOWN";
    againstRole: "POSTER" | "CONTRACTOR" | "UNKNOWN";
  };
  job: {
    title: string;
    status: string;
    paymentStatus: string | null;
    payoutStatus: string | null;
    amountCents: number | null;
    currency: string | null;
    contractorCompletionSummary: string | null;
    customerCompletionSummary: string | null;
  } | null;
  evidenceCount: number;
};

export type AiDisputeAdvisoryResult = {
  // Per spec: AI advisory is a vote only; it cannot auto-resolve.
  decision: "POSTER" | "CONTRACTOR" | "SPLIT";
  confidencePct: number; // 0..100
  reasoning: string;
  model: string;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("AI returned non-JSON output");
  }
}

export async function requestAiDisputeAdvisory(input: AiDisputeAdvisoryInput): Promise<AiDisputeAdvisoryResult> {
  const apiKey = process.env.OPEN_AI_API_KEY;
  if (!apiKey) {
    return {
      decision: "SPLIT",
      confidencePct: 0,
      reasoning: "OpenAI API key not configured",
      model: OPENAI_APPRAISAL_MODEL,
    };
  }

  const model = OPENAI_APPRAISAL_MODEL;

  const prompt = [
    "Return strict JSON only.",
    'Schema: {"decision":"POSTER|CONTRACTOR|SPLIT","confidence":0-100,"reasoning":"..."}',
    "",
    "You are an internal dispute advisory model for 8Fold Local.",
    "You do not see any hidden info beyond what is provided below.",
    "If information is insufficient, choose SPLIT with low confidence and ask for missing evidence in reasoning.",
    "",
    "Dispute:",
    JSON.stringify(input.dispute, null, 2),
    "",
    "Job:",
    JSON.stringify(input.job, null, 2),
    "",
    `EvidenceCount: ${input.evidenceCount}`,
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: "low" },
      max_output_tokens: 800,
    }),
  });

  const raw = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    const msg = raw?.error?.message || `OpenAI request failed (${resp.status})`;
    throw new Error(msg);
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

  const parsed = extractJson(text);
  const decision = String(parsed?.decision ?? "SPLIT").toUpperCase();
  const allowed = new Set(["POSTER", "CONTRACTOR", "SPLIT"]);
  const outDecision = (allowed.has(decision) ? decision : "SPLIT") as AiDisputeAdvisoryResult["decision"];
  const confidencePct = clampInt(Number(parsed?.confidence ?? parsed?.confidencePct ?? 0), 0, 100);
  const reasoning = String(parsed?.reasoning ?? "").trim().slice(0, 4000);

  return {
    decision: outDecision,
    confidencePct,
    reasoning: reasoning || "No reasoning provided",
    model,
  };
}


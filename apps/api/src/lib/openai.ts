import OpenAI from "openai";

if (!process.env.OPEN_AI_API_KEY) {
  // eslint-disable-next-line no-console
  console.error("❌ OPEN_AI_API_KEY missing at startup");
}

let singleton: OpenAI | null = null;

export function getOpenAiClient(): OpenAI {
  const apiKey = String(process.env.OPEN_AI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("OPEN_AI_API_KEY missing in API runtime");
  }
  if (!singleton) {
    singleton = new OpenAI({ apiKey });
  }
  return singleton;
}

export const OPENAI_APPRAISAL_MODEL = "gpt-5-nano" as const;

/**
 * Minimal connectivity test using same client/config as appraisal.
 * Used by internal ai-key-test harness to validate runtime.
 */
export async function verifyOpenAiConnection(): Promise<{ ping: string }> {
  const client = getOpenAiClient();
  const raw = (await client.responses.create({
    model: OPENAI_APPRAISAL_MODEL,
    input: [
      { role: "system", content: "Return only valid JSON. No other text." },
      { role: "user", content: 'Return JSON: {"ping":"pong"}' },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: 100,
  })) as { output_text?: string };
  const content = typeof raw?.output_text === "string" ? raw.output_text : "";
  if (!content) throw new Error("OpenAI returned empty content");
  const parsed = JSON.parse(content) as { ping?: string };
  if (parsed?.ping !== "pong") throw new Error(`Unexpected response: ${JSON.stringify(parsed)}`);
  return { ping: parsed.ping };
}

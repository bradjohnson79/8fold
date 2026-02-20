/**
 * OPEN_AI_API_KEY Backend Validation Harness
 *
 * Temporary diagnostic route. Delete after confirming appraisal works.
 * Hit: GET /api/internal/ai-key-test
 *
 * Verifies:
 * - OPEN_AI_API_KEY is accessible in deployed runtime
 * - Key is valid and can call OpenAI
 * - Model gpt-5-nano is callable
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getOpenAiClient, OPENAI_APPRAISAL_MODEL } from "../../../../src/lib/openai";

const MODEL = OPENAI_APPRAISAL_MODEL;

function traceId(): string {
  return crypto.randomUUID();
}

export async function GET() {
  const tid = traceId();

  // 1. Log key presence
  const keyPresent = !!process.env.OPEN_AI_API_KEY;
  const keyLength = process.env.OPEN_AI_API_KEY?.length ?? 0;
  // eslint-disable-next-line no-console
  console.log("🔑 OPEN_AI_API_KEY present:", keyPresent);
  // eslint-disable-next-line no-console
  console.log("🔑 Key length:", keyLength);

  if (!keyPresent || keyLength === 0) {
    return NextResponse.json(
      { ok: false, error: "AI_CONFIG_MISSING" },
      { status: 500 }
    );
  }

  try {
    const openai = getOpenAiClient();
    const rawResponse = (await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: "Return only valid JSON. No other text." },
        { role: "user", content: 'Return JSON: {"ping":"pong"}' },
      ],
      reasoning: { effort: "low" },
      max_output_tokens: 100,
    })) as { output_text?: string; output?: unknown };

    const content = typeof rawResponse?.output_text === "string" ? rawResponse.output_text : "";
    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI_RUNTIME_ERROR",
          message: "OpenAI returned empty content",
          traceId: tid,
        },
        { status: 502 }
      );
    }

    let parsed: { ping?: string } | null = null;
    try {
      parsed = JSON.parse(String(content));
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "AI_RUNTIME_ERROR",
          message: "AI returned non-JSON content",
          traceId: tid,
          rawContent: content.slice(0, 200),
        },
        { status: 502 }
      );
    }

    if (parsed?.ping !== "pong") {
      return NextResponse.json(
        {
          ok: false,
          error: "AI_RUNTIME_ERROR",
          message: `Unexpected response: ${JSON.stringify(parsed)}`,
          traceId: tid,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      model: MODEL,
      responseValid: true,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; name?: string };
    const status = typeof e?.status === "number" ? e.status : null;
    const message = String(e?.message ?? e ?? "Unknown error");

    let errorType = "UNKNOWN";
    if (status === 401) errorType = "INVALID_KEY";
    else if (status === 404) errorType = "INVALID_MODEL";
    else if (status === 429) errorType = "RATE_LIMIT";
    else if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError") errorType = "NETWORK";
    else if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch") || message.toLowerCase().includes("econnrefused")) errorType = "NETWORK";

    // eslint-disable-next-line no-console
    console.error("[ai-key-test] OpenAI error:", { status, errorType, message });

    return NextResponse.json(
      {
        ok: false,
        error: "AI_RUNTIME_ERROR",
        code: "AI_RUNTIME_ERROR",
        type: errorType,
        message,
        traceId: tid,
      },
      { status: status && status >= 400 && status < 600 ? status : 502 }
    );
  }
}

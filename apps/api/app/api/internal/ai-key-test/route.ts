/**
 * OPEN_AI_API_KEY Backend Validation Harness
 *
 * Temporary diagnostic route. Delete after confirming appraisal works.
 * Hit: GET /api/internal/ai-key-test
 * Header: x-internal-secret: <INTERNAL_DEBUG_SECRET>
 *
 * Verifies:
 * - OPEN_AI_API_KEY is accessible in deployed runtime
 * - Key is valid and can call OpenAI
 * - Model gpt-5-nano is callable
 * - Same code path as appraisal (verifyOpenAiConnection → getOpenAiClient)
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { OPENAI_APPRAISAL_MODEL, verifyOpenAiConnection } from "../../../../src/lib/openai";

function traceId(): string {
  return crypto.randomUUID();
}

export async function GET(req: Request) {
  const tid = traceId();

  // Guard: require secret header to prevent /api/internal/* scanning
  const secret = process.env.INTERNAL_DEBUG_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json(
      { ok: false, error: "NOT_ALLOWED" },
      { status: 403 }
    );
  }

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
    // Use same code path as appraisal: verifyOpenAiConnection → getOpenAiClient → responses.create
    await verifyOpenAiConnection();

    return NextResponse.json({
      ok: true,
      model: OPENAI_APPRAISAL_MODEL,
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

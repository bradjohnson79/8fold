import { NextResponse } from "next/server";
import { toHttpError } from "../../../../src/http/errors";
import { z } from "zod";
import { requestLoginCode } from "../../../../src/auth/mobileAuth";
import crypto from "node:crypto";
import { logApiError } from "@/src/lib/errors/errorLogger";
import { authRateLimitConfig, rateLimitJson } from "@/src/server/rateLimit";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  email: z.string().trim().email()
});

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  try {
    const rl = authRateLimitConfig();
    const limited = rateLimitJson(req, { key: "auth:request", ...rl.request });
    if (limited) return limited;

    let rawBody: unknown = {};
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body", code: "INVALID_JSON", requestId },
        { status: 400 },
      );
    }
    const body = BodySchema.safeParse(rawBody);
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input", code: "INVALID_INPUT", requestId },
        { status: 400 },
      );
    }

    const result = await requestLoginCode(body.data.email);
    logEvent({
      level: "info",
      event: "auth.request",
      route: "/api/auth/request",
      method: "POST",
      status: 200,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ ...result, requestId }, { status: 200 });
  } catch (err) {
    logApiError({ context: "POST /api/auth/request", err, meta: { requestId } });
    const { status, message, code, context } = toHttpError(err);
    logEvent({
      level: "error",
      event: "auth.request_error",
      route: "/api/auth/request",
      method: "POST",
      status,
      durationMs: Date.now() - start,
      code,
      context,
    });
    return NextResponse.json({ ok: false, error: message, code, context, requestId }, { status });
  }
}


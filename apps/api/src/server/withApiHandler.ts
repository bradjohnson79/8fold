import { randomUUID } from "node:crypto";
import { logApiError } from "@/src/lib/errors/logApiError";
import { isApiRouteError } from "@/src/lib/errors/apiRouteError";
import { mapErrorCode } from "@/src/lib/errors/mapErrorCode";
import { safeErrorMessage } from "@/src/lib/errors/safeErrorMessage";
import { ok, fail } from "@/src/lib/api/respond";
import { ZodError } from "zod";

export type ApiHandlerContext = {
  requestId: string;
};

export type ApiHandler = (req: Request, ctx: ApiHandlerContext) => Promise<Response>;

/**
 * Universal API route wrapper.
 * - Generates requestId per request
 * - Wraps handler in try/catch
 * - Logs structured errors (production-safe)
 * - Returns safe error envelope with x-request-id
 * - Never throws; always returns Response
 */
export function withApiHandler(handler: ApiHandler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = randomUUID();
    const ctx: ApiHandlerContext = { requestId };
    const path = new URL(req.url).pathname;
    const method = req.method;

    const addRequestId = async (resp: Response, bodyPatch?: Record<string, unknown>): Promise<Response> => {
      const h = new Headers(resp.headers);
      h.set("x-request-id", requestId);
      if (!bodyPatch) return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
      try {
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
        const body = await resp.clone().json().catch(() => null);
        if (body && typeof body === "object") {
          const merged = { ...body, ...bodyPatch };
          return new Response(JSON.stringify(merged), { status: resp.status, statusText: resp.statusText, headers: h });
        }
      } catch {
        /* ignore */
      }
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
    };

    try {
      const result = await handler(req, ctx);
      return await addRequestId(result, { requestId });
    } catch (err) {
      let status = 500;
      let code = "internal_error";

      if (isApiRouteError(err)) {
        status = err.status;
        code = err.code;
      } else if (err instanceof ZodError) {
        status = 400;
        code = "invalid_input";
      } else if (err instanceof SyntaxError && /json/i.test((err as Error).message)) {
        status = 400;
        code = "invalid_json";
      } else {
        code = mapErrorCode(err);
        if (code === "unauthorized") status = 401;
        else if (code === "forbidden") status = 403;
        else if (code === "conflict_error") status = 409;
        else if (code === "invalid_reference") status = 400;
        else if (code === "not_found") status = 404;
        else status = 500;
      }

      logApiError(err, { requestId, path, method });

      const message = safeErrorMessage(err, status);

      const failResp = fail(status, code, { message });
      return await addRequestId(failResp);
    }
  }
}

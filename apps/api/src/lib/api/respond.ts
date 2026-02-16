import { NextResponse } from "next/server";

export type ResponseInit = { status?: number; headers?: HeadersInit };

/**
 * Success response: { ok: true, data }
 */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const status = init?.status ?? 200;
  const headers = init?.headers;
  const resp = NextResponse.json({ ok: true, data }, { status });
  if (headers) {
    const h = new Headers(resp.headers);
    new Headers(headers).forEach((v, k) => h.set(k, v));
    return new NextResponse(resp.body, { status: resp.status, headers: h });
  }
  return resp;
}

/**
 * Failure response: { ok: false, error }
 */
export function fail(status: number, code: string, init?: Omit<ResponseInit, "status">): NextResponse {
  const headers = init?.headers;
  const message =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "Not Found"
          : status === 400
            ? "Bad Request"
            : status >= 400 && status < 500
              ? "Request failed"
              : "Server error";
  const resp = NextResponse.json({ ok: false, error: message, code }, { status });
  if (headers) {
    const h = new Headers(resp.headers);
    new Headers(headers).forEach((v, k) => h.set(k, v));
    return new NextResponse(resp.body, { status, headers: h });
  }
  return resp;
}

/**
 * 400 Bad Request
 */
export function badRequest(error: string, init?: Omit<ResponseInit, "status">): NextResponse {
  return fail(400, error, init);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(error = "unauthorized", init?: Omit<ResponseInit, "status">): NextResponse {
  return fail(401, error, init);
}

/**
 * 403 Forbidden
 */
export function forbidden(error = "forbidden", init?: Omit<ResponseInit, "status">): NextResponse {
  return fail(403, error, init);
}

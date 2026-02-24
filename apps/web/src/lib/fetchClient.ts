/**
 * Unified fetch client for API calls.
 * Expects structured envelope: { ok: true, data, requestId } | { ok: false, error: { code, message }, requestId }
 * Logs requestId on failure. Never swallows errors.
 */

export type ApiOk<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiFail = {
  ok: false;
  error: { code: string; message: string };
  requestId?: string;
};

export type ApiEnvelope<T> = ApiOk<T> | ApiFail;

function isStructuredError(body: unknown): body is ApiFail {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as ApiFail).ok === false &&
    typeof (body as ApiFail).error === "object"
  );
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (isStructuredError(body)) {
    const msg = body.error?.message;
    if (typeof msg === "string") return msg;
  }
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string") return e;
    if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
      return (e as { message: string }).message;
    }
  }
  if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return fallback;
}

function extractRequestId(body: unknown, headers: Headers): string | null {
  const fromHeader = headers.get("x-request-id");
  if (fromHeader) return fromHeader;
  if (body && typeof body === "object" && "requestId" in body && typeof (body as { requestId: unknown }).requestId === "string") {
    return (body as { requestId: string }).requestId;
  }
  return null;
}

export type FetchClientOptions = RequestInit & {
  baseUrl?: string;
};

/**
 * Fetches API endpoint and parses structured envelope.
 * Returns T (data) on ok:true. Throws on failure with message + requestId.
 * Always logs failures to console.
 */
export async function fetchClient<T>(path: string, opts?: FetchClientOptions): Promise<T> {
  const { baseUrl, ...fetchInit } = opts ?? {};
  const url = baseUrl ? `${String(baseUrl).replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}` : path;

  const resp = await fetch(url, {
    ...fetchInit,
    credentials: fetchInit.credentials ?? "include",
    cache: fetchInit.cache ?? "no-store",
  });

  const contentType = resp.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  const body = isJson ? await resp.json().catch(() => ({})) : null;
  const requestId = body ? extractRequestId(body, resp.headers) : resp.headers.get("x-request-id");

  if (!resp.ok) {
    const message = body ? extractErrorMessage(body, `Request failed (${resp.status})`) : `Request failed (${resp.status})`;
    const errMsg = requestId ? `${message} (requestId: ${requestId})` : message;
    if (typeof console !== "undefined" && console.error) {
      // eslint-disable-next-line no-console
      console.error(`[fetchClient] ${resp.status} ${path} requestId=${requestId ?? "?"}`, message);
    }
    throw new Error(errMsg);
  }

  if (!isJson) {
    const errMsg = requestId ? `Non-JSON response (requestId: ${requestId})` : "Non-JSON response";
    if (typeof console !== "undefined" && console.error) {
      // eslint-disable-next-line no-console
      console.error(`[fetchClient] non-JSON ${path} requestId=${requestId ?? "?"}`);
    }
    throw new Error(errMsg);
  }

  if (isStructuredError(body)) {
    const message = body.error?.message ?? "Request failed";
    const errMsg = requestId ? `${message} (requestId: ${requestId})` : message;
    if (typeof console !== "undefined" && console.error) {
      // eslint-disable-next-line no-console
      console.error(`[fetchClient] ok=false ${path} requestId=${requestId ?? "?"}`, body.error?.code, message);
    }
    throw new Error(errMsg);
  }

  if (body && typeof body === "object" && body.ok === true && "data" in body) {
    return (body as ApiOk<T>).data as T;
  }

  return body as T;
}

/**
 * LGS operational isolation helper (apps/lgs).
 *
 * This module exists ONLY to proxy HTTP calls to `apps/api` (configured by `API_ORIGIN`).
 * It must not import or depend on jobs lifecycle, ledger, Stripe/payments, or any DB client.
 */
function requireApiOrigin(): string {
  const v = process.env.API_ORIGIN;
  if (!v) throw new Error("API_ORIGIN is not defined");
  return v.replace(/\/+$/, "");
}

export function getApiOrigin(): string {
  return requireApiOrigin();
}

export async function proxyToApi(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PATCH" | "OPTIONS";
    body?: unknown;
    searchParams?: URLSearchParams;
  } = {}
): Promise<Response> {
  const origin = getApiOrigin();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
  if (opts.searchParams) {
    opts.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  }
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (opts.body != null && opts.method !== "GET") {
    init.body = JSON.stringify(opts.body);
  }
  return fetch(url.toString(), init);
}

/** Forward request as-is (e.g. multipart form-data). */
export async function proxyToApiRaw(path: string, req: Request): Promise<Response> {
  const origin = getApiOrigin();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
  const headers = new Headers(req.headers);
  headers.delete("host");
  return fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.body,
    // Required by Node.js fetch when streaming a request body (e.g. multipart)
    duplex: "half",
  } as RequestInit);
}

function resolveOrigin(opts: {
  label: "API_ORIGIN" | "ADMIN_ORIGIN" | "WEB_ORIGIN";
  raw: string | null | undefined;
}): string {
  const base = String(opts.raw ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error(`${opts.label} is not set`);
  }
  return base;
}

function logBootConfigOnce() {
  const KEY = "__8FOLD_BOOT_CONFIG_LOGGED__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;
  // Resolving origins here forces fail-fast on empty-string env.
  // Intentionally no console logging in production-readiness freeze.
  getApiOrigin();
  getAdminOrigin();
  getWebOrigin();
}

export function getApiOrigin(): string {
  return resolveOrigin({
    label: "API_ORIGIN",
    raw: process.env.API_ORIGIN,
  });
}

export function getAdminOrigin(): string {
  return resolveOrigin({
    label: "ADMIN_ORIGIN",
    raw: process.env.ADMIN_ORIGIN,
  });
}

export function getWebOrigin(): string {
  return resolveOrigin({
    label: "WEB_ORIGIN",
    raw: process.env.WEB_ORIGIN,
  });
}

/** Back-compat alias for older code. */
export function getApiBase(): string {
  return getApiOrigin();
}

export function authHeadersFromSessionToken(
  sessionToken: string | null | undefined,
): Record<string, string> {
  const token = String(sessionToken ?? "").trim();
  if (!token) return {};
  return {
    authorization: `Bearer ${token}`,
    "x-session-token": token,
  };
}

async function originFetch(reqInit: {
  origin: string;
  path: string;
  method?: string;
  sessionToken?: string | null;
  /**
   * Optional request whose cookies should be forwarded to upstream.
   */
  request?: Request;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  const url = `${reqInit.origin}${reqInit.path.startsWith("/") ? "" : "/"}${reqInit.path}`;

  const forwardedCookie =
    (reqInit.headers && typeof (reqInit.headers as any).cookie === "string"
      ? (reqInit.headers as any).cookie
      : null) ?? reqInit.request?.headers.get("cookie") ?? null;

  const mergedHeaders: Record<string, string> = {
    ...(reqInit.headers ?? {}),
    ...authHeadersFromSessionToken(reqInit.sessionToken),
  };
  if (forwardedCookie && !("cookie" in mergedHeaders) && !("Cookie" in mergedHeaders)) {
    mergedHeaders.cookie = forwardedCookie;
  }

  return await fetch(url, {
    method: reqInit.method ?? "GET",
    headers: mergedHeaders,
    body: reqInit.body,
    cache: "no-store",
  });
}

export async function apiFetch(reqInit: {
  /**
   * Target service for this proxy call.
   * Default is apps/api.
   */
  target?: "api" | "admin" | "web";
  path: string;
  method?: string;
  sessionToken?: string | null;
  request?: Request;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  const target = reqInit.target ?? "api";
  const origin =
    target === "admin"
      ? getAdminOrigin()
      : target === "web"
        ? getWebOrigin()
        : getApiOrigin();
  const { target: _t, ...rest } = reqInit;
  return await originFetch({ ...(rest as any), origin });
}

export async function adminFetch(reqInit: {
  path: string;
  method?: string;
  sessionToken?: string | null;
  request?: Request;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  // Back-compat wrapper. Prefer `apiFetch({ target: "admin", ... })`.
  return await apiFetch({ ...(reqInit as any), target: "admin" });
}

// Trigger one-time boot diagnostics when this module loads.
logBootConfigOnce();


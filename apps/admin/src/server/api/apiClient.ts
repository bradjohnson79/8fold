export function getApiOrigin(): string {
  const v = String(process.env.API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error("API_ORIGIN is not set");
  return v;
}

export function authHeadersFromSessionToken(sessionToken: string | null | undefined): Record<string, string> {
  const token = String(sessionToken ?? "").trim();
  if (!token) return {};
  return {
    authorization: `Bearer ${token}`,
    "x-session-token": token,
  };
}

export async function apiFetch(reqInit: {
  path: string;
  method?: string;
  sessionToken?: string | null;
  headers?: Record<string, string>;
  body?: string;
}): Promise<Response> {
  const base = getApiOrigin();
  const url = `${base}${reqInit.path.startsWith("/") ? "" : "/"}${reqInit.path}`;
  return await fetch(url, {
    method: reqInit.method ?? "GET",
    headers: {
      ...(reqInit.headers ?? {}),
      ...authHeadersFromSessionToken(reqInit.sessionToken),
    },
    body: reqInit.body,
    cache: "no-store",
  });
}


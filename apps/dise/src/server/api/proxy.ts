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
    method?: "GET" | "POST" | "PATCH";
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

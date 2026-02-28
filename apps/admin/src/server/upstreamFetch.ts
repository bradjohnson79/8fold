function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DEFAULT_TIMEOUT_MS = parsePositiveInt(process.env.ADMIN_UPSTREAM_TIMEOUT_MS, 8000);

function buildTimeoutError(timeoutMs: number): Error {
  return Object.assign(new Error(`Upstream timeout (${timeoutMs}ms)`), {
    status: 504,
    code: "UPSTREAM_TIMEOUT",
  });
}

function buildNetworkError(): Error {
  return Object.assign(new Error("Upstream request failed."), {
    status: 502,
    code: "UPSTREAM_ERROR",
  });
}

export async function fetchWithAdminTimeout(input: string | URL, init?: RequestInit): Promise<Response> {
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const name = String(err?.name ?? "");
    if (name === "AbortError" || name === "TimeoutError") {
      throw buildTimeoutError(timeoutMs);
    }
    throw buildNetworkError();
  }
}


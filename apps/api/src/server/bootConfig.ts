type OriginEnvName = "API_ORIGIN" | "ADMIN_ORIGIN" | "WEB_ORIGIN";

const DEFAULT_SERVER_ORIGINS: Record<OriginEnvName, string> = {
  API_ORIGIN: "https://api.8fold.app",
  ADMIN_ORIGIN: "https://admin.8fold.app",
  WEB_ORIGIN: "https://8fold.app",
};

function resolve(name: string, raw: string | undefined): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

function resolveOrigin(name: OriginEnvName, raw: string | undefined): string {
  const input = String(raw ?? DEFAULT_SERVER_ORIGINS[name]).trim();
  if (!input) {
    throw new Error(`${name} is not set`);
  }
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${name} must be a valid URL/host, received "${input}"`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error(`${name} must be a server-side domain (localhost is not allowed)`);
  }

  return parsed.origin.replace(/\/+$/, "");
}

export function getApiOrigin(): string {
  return resolveOrigin("API_ORIGIN", process.env.API_ORIGIN);
}

export function getAdminOrigin(): string {
  return resolveOrigin("ADMIN_ORIGIN", process.env.ADMIN_ORIGIN);
}

export function getWebOrigin(): string {
  return resolveOrigin("WEB_ORIGIN", process.env.WEB_ORIGIN);
}

export function logBootConfigOnce() {
  const KEY = "__8FOLD_BOOT_CONFIG_LOGGED__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  // Explicit split origins required (no silent fallbacks).
  // Fail-fast validation only (no console diagnostics in freeze).
  getApiOrigin();
  getAdminOrigin();
  getWebOrigin();

  // Clerk JWT verification must be configured in apps/api.
  // Fail fast at boot to avoid confusing 500s later.
  resolve("CLERK_ISSUER", process.env.CLERK_ISSUER);
}

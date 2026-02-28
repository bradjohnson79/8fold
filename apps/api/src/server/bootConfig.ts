type OriginEnvName = "API_ORIGIN" | "ADMIN_ORIGIN" | "WEB_ORIGIN";

function missingOriginError(name: OriginEnvName): Error {
  const mode = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
  const baseMessage = `${name} is not set`;
  const message =
    mode && mode !== "development"
      ? `CONFIG_ORIGIN_MISSING:${name}`
      : `${baseMessage}. Set ${name} in your environment.`;
  return Object.assign(new Error(message), { code: "CONFIG_ORIGIN_MISSING", originVar: name });
}

function resolve(name: string, raw: string | undefined): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

function resolveOrigin(name: OriginEnvName, raw: string | undefined): string {
  const input = String(raw ?? "").trim();
  if (!input) {
    throw missingOriginError(name);
  }
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw Object.assign(new Error(`CONFIG_ORIGIN_INVALID:${name}`), { code: "CONFIG_ORIGIN_INVALID", originVar: name });
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

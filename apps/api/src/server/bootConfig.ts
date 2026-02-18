function resolve(name: string, raw: string | undefined): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

export function logBootConfigOnce() {
  const KEY = "__8FOLD_BOOT_CONFIG_LOGGED__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  // Explicit split origins required (no silent fallbacks).
  // Fail-fast validation only (no console diagnostics in freeze).
  resolve("API_ORIGIN", process.env.API_ORIGIN);
  resolve("ADMIN_ORIGIN", process.env.ADMIN_ORIGIN);
  resolve("WEB_ORIGIN", process.env.WEB_ORIGIN);

  // Clerk JWT verification must be configured in apps/api.
  // Fail fast at boot to avoid confusing 500s later.
  resolve("CLERK_ISSUER", process.env.CLERK_ISSUER);
}


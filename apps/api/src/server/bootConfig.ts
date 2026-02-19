function resolve(name: string, raw: string | undefined): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

function assertNoLocalhostOrigin(name: string, origin: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const v = origin.toLowerCase();
  if (v.includes("localhost") || v.includes("127.0.0.1") || v.includes("::1")) {
    throw new Error(`${name} must not reference localhost in production`);
  }
}

export function logBootConfigOnce() {
  const KEY = "__8FOLD_BOOT_CONFIG_LOGGED__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  // Explicit split origins required (no silent fallbacks).
  // Fail-fast validation only (no console diagnostics in freeze).
  const apiOrigin = resolve("API_ORIGIN", process.env.API_ORIGIN);
  const adminOrigin = resolve("ADMIN_ORIGIN", process.env.ADMIN_ORIGIN);
  const webOrigin = resolve("WEB_ORIGIN", process.env.WEB_ORIGIN);

  assertNoLocalhostOrigin("API_ORIGIN", apiOrigin);
  assertNoLocalhostOrigin("ADMIN_ORIGIN", adminOrigin);
  assertNoLocalhostOrigin("WEB_ORIGIN", webOrigin);

  // Clerk JWT verification must be configured in apps/api.
  // Fail fast at boot to avoid confusing 500s later.
  resolve("CLERK_ISSUER", process.env.CLERK_ISSUER);
}


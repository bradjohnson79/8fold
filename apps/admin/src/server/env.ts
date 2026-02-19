export function getValidatedApiOrigin(): string {
  // Admin remains DB-free and proxies to apps/api only.
  // Origin configuration must come from environment (no localhost fallbacks in source).
  const raw = process.env.NEXT_PUBLIC_API_ORIGIN;
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_API_ORIGIN is required for apps/admin");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_ORIGIN must be a valid URL, received "${value}"`);
  }

  if (!parsed.protocol || !parsed.host) {
    throw new Error(`NEXT_PUBLIC_API_ORIGIN must include protocol and host, received "${value}"`);
  }

  return parsed.origin.replace(/\/+$/, "");
}

function logAdminEnvOnce(): void {
  if (process.env.NODE_ENV === "production") return;
  const g = globalThis as any;
  if (g.__8FOLD_ADMIN_ENV_LOGGED__) return;
  g.__8FOLD_ADMIN_ENV_LOGGED__ = true;

  // eslint-disable-next-line no-console
  console.log("[ADMIN ENV]", {
    NEXT_PUBLIC_API_ORIGIN: String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim(),
    API_ORIGIN: String(process.env.API_ORIGIN ?? "").trim(),
  });

  // User asked to confirm DB sync; never log raw DATABASE_URL (it contains credentials).
  const rawDb = String(process.env.DATABASE_URL ?? "").trim();
  if (!rawDb) return;
  try {
    const u = new URL(rawDb);
    // eslint-disable-next-line no-console
    console.log("[ADMIN DB]", {
      host: u.host,
      database: u.pathname.replace(/^\//, ""),
      schema: u.searchParams.get("schema"),
      sslmode: u.searchParams.get("sslmode"),
    });
  } catch {
    // eslint-disable-next-line no-console
    console.log("[ADMIN DB]", { configured: true, parsed: false });
  }
}

export function validateAdminEnv(): void {
  void getValidatedApiOrigin();
  logAdminEnvOnce();
}

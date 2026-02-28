export function getValidatedApiOrigin(): string {
  const prodPinnedApiOrigin = "https://api.8fold.app";
  const isProd = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";

  // Admin remains DB-free and proxies to apps/api only.
  // Server-side API origin is sourced from API_ORIGIN only.
  // Admin never connects to DB directly; it proxies to apps/api only.
  const raw = process.env.API_ORIGIN;
  const value = String(raw ?? "").trim();
  if (!value) {
    if (isProd) return prodPinnedApiOrigin;
    const mode = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
    const message =
      mode && mode !== "development"
        ? "CONFIG_ORIGIN_MISSING:API_ORIGIN"
        : "API_ORIGIN is not set. Set API_ORIGIN in your environment.";
    throw Object.assign(new Error(message), { code: "CONFIG_ORIGIN_MISSING", originVar: "API_ORIGIN" });
  }

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw Object.assign(new Error("CONFIG_ORIGIN_INVALID:API_ORIGIN"), {
      code: "CONFIG_ORIGIN_INVALID",
      originVar: "API_ORIGIN",
    });
  }

  if (!parsed.protocol || !parsed.host) {
    throw Object.assign(new Error("CONFIG_ORIGIN_INVALID:API_ORIGIN"), {
      code: "CONFIG_ORIGIN_INVALID",
      originVar: "API_ORIGIN",
    });
  }

  if (isProd && parsed.origin.replace(/\/+$/, "") !== prodPinnedApiOrigin) {
    console.warn("[ADMIN_ENV_WARN]", {
      message: "API_ORIGIN mismatched in production; using pinned api.8fold.app",
      configured: parsed.origin,
      using: prodPinnedApiOrigin,
    });
    return prodPinnedApiOrigin;
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
  try {
    void getValidatedApiOrigin();
    logAdminEnvOnce();
  } catch (e) {
    // Log before rethrow so Vercel logs show the cause (e.g. missing API_ORIGIN)
    console.error("[ADMIN_ENV_ERROR]", { message: (e as Error)?.message });
    throw e;
  }
}

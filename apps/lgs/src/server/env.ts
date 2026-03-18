export function getValidatedApiOrigin(): string {
  const prodPinnedApiOrigin = "https://api.8fold.app";
  const isProd = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";

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
    console.warn("[LGS_ENV_WARN]", {
      message: "API_ORIGIN mismatched in production; using pinned api.8fold.app",
      configured: parsed.origin,
      using: prodPinnedApiOrigin,
    });
    return prodPinnedApiOrigin;
  }

  return parsed.origin.replace(/\/+$/, "");
}

export function validateLgsEnv(): void {
  try {
    void getValidatedApiOrigin();
  } catch (e) {
    console.error("[LGS_ENV_ERROR]", { message: (e as Error)?.message });
    throw e;
  }
}

export function getValidatedApiOrigin(): string {
  // Admin remains DB-free and proxies to apps/api only.
  // API_ORIGIN must be explicit: no fallback origin is allowed.
  const raw = process.env.API_ORIGIN;
  const value = String(raw ?? "").trim();
  if (!value) {
    throw new Error("API_ORIGIN is required for apps/admin");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`API_ORIGIN must be a valid URL, received "${value}"`);
  }

  if (!parsed.protocol || !parsed.host) {
    throw new Error(`API_ORIGIN must include protocol and host, received "${value}"`);
  }

  return parsed.origin.replace(/\/+$/, "");
}

export function validateAdminEnv(): void {
  void getValidatedApiOrigin();
}

export type AuthMode = "dev" | "production";

export function getAuthMode(): AuthMode {
  const v = String(process.env.AUTH_MODE ?? "").trim().toLowerCase();
  if (v === "dev" || v === "development") return "dev";
  if (v === "production" || v === "prod") return "production";

  // Default rule: dev unless explicitly production.
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}


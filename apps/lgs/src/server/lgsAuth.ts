import { cookies } from "next/headers";

export const LGS_AUTH_COOKIE = "lgs_auth";

export async function isLgsAuthenticated(): Promise<boolean> {
  const value = (await cookies()).get(LGS_AUTH_COOKIE)?.value?.trim();
  return value === "true";
}

// Legacy: kept for proxy routes that pass Authorization header to the API.
// Returns a bearer token from LGS_API_KEY env var if set, otherwise an empty string.
export async function getLgsAuthHeader(): Promise<string> {
  const authenticated = await isLgsAuthenticated();
  if (!authenticated) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  // Use a dedicated API key for server-to-server calls if configured
  const apiKey = String(process.env.LGS_API_KEY ?? process.env.CRON_SECRET ?? "").trim();
  return apiKey ? `Bearer ${apiKey}` : "";
}

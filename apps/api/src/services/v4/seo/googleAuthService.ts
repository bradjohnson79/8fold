/**
 * Shared Google auth for service account JWT.
 * Used by: indexingService (Indexing API), ga4AnalyticsService (Analytics Data API).
 */

/** Resolves Google service account from env. Supports:
 * 1. GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON (base64-encoded JSON)
 * 2. GOOGLE_INDEXING_CLIENT_EMAIL + GOOGLE_INDEXING_PRIVATE_KEY (individual vars)
 */
export function getGoogleServiceAccount(): Record<string, string> | null {
  const jsonB64 = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON;
  if (jsonB64) {
    try {
      return JSON.parse(atob(jsonB64)) as Record<string, string>;
    } catch {
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim();
  let privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;

  privateKey = privateKey.replace(/\\n/g, "\n");
  return { client_email: clientEmail, private_key: privateKey };
}

/**
 * Signs a Google service account JWT and exchanges for access token.
 * Scope examples: indexing, analytics.readonly
 */
export async function getGoogleAccessToken(
  serviceAccount: Record<string, string>,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const toBase64Url = (str: string): string =>
    btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      iss: serviceAccount["client_email"],
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${payload}`;

  const pemBody = (serviceAccount["private_key"] ?? "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signingInput}.${signature}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`Failed to get Google access token: ${tokenResp.status}`);
  }
  const data = (await tokenResp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in Google token response");
  return data.access_token;
}

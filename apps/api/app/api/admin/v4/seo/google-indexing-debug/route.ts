/**
 * Debug endpoint for Google Indexing API configuration.
 * Returns which env vars are present and whether the service can initialize.
 * Use for diagnosing "Not Configured" in Admin Analytics.
 */
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const envClientEmail = Boolean(process.env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim());
    const envPrivateKey = Boolean(process.env.GOOGLE_INDEXING_PRIVATE_KEY?.trim());
    const envProjectId = Boolean(process.env.GOOGLE_INDEXING_PROJECT_ID?.trim());
    const envServiceAccountJson = Boolean(process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON?.trim());

    // Service is configured if: (1) full JSON, or (2) client_email + private_key
    const serviceInitialized =
      envServiceAccountJson || (envClientEmail && envPrivateKey);

    return ok({
      envClientEmail,
      envPrivateKey,
      envProjectId,
      envServiceAccountJson,
      serviceInitialized,
      expectedVars: [
        "GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON (base64 JSON) — OR —",
        "GOOGLE_INDEXING_CLIENT_EMAIL",
        "GOOGLE_INDEXING_PRIVATE_KEY",
        "GOOGLE_INDEXING_PROJECT_ID (optional)",
      ],
    });
  } catch (e) {
    console.error("[seo/google-indexing-debug GET]", e);
    return err(500, "DEBUG_ERROR", "Failed to check Google Indexing config");
  }
}

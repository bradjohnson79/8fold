import { NextResponse } from "next/server";
import { getApiOrigin } from "@/server/api/apiClient";

/**
 * GET /api/app/diag/auth
 * No auth required. Returns web app auth config for quick production verification.
 */
export async function GET() {
  let apiOrigin: string;
  try {
    apiOrigin = getApiOrigin();
  } catch {
    apiOrigin = "(not set)";
  }
  const hasClerkKey = !!String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
  const env = process.env.NODE_ENV ?? "development";
  const clerkIssuerEnv = String(process.env.CLERK_ISSUER ?? "").trim() || "(not set - configure in apps/api)";

  return NextResponse.json({
    apiOrigin,
    hasClerkKey,
    clerkIssuerEnv,
    env,
  });
}

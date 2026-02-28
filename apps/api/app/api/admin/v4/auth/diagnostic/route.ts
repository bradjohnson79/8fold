import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminIdentity } from "@/src/adminBus/auth";
import { tokenFromRequest, verifyAdminToken } from "@/src/lib/auth/adminSessionAuth";

export const dynamic = "force-dynamic";

function secretFingerprint(secret: string): string | null {
  const trimmed = String(secret ?? "").trim();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
}

function toIso(epochSeconds: number | undefined): string | null {
  if (!Number.isFinite(epochSeconds)) return null;
  return new Date(Number(epochSeconds) * 1000).toISOString();
}

export async function GET(req: Request) {
  const authed = await requireAdminIdentity(req);
  if (authed instanceof Response) return authed;

  const secret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();
  const token = tokenFromRequest(req);

  let tokenValid = false;
  let issuedAt: string | null = null;
  let expiresAt: string | null = null;

  if (token) {
    try {
      const parsed = verifyAdminToken(token);
      tokenValid = true;
      issuedAt = toIso(parsed.iat);
      expiresAt = toIso(parsed.exp);
    } catch {
      tokenValid = false;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        guard: "adminBus.requireAdminIdentity.v1",
        secretConfigured: secret.length > 0,
        secretFingerprint: secretFingerprint(secret),
        tokenPresent: Boolean(token),
        tokenValid,
        adminResolved: true,
        adminId: authed.adminId,
        role: authed.role,
        email: authed.email,
        issuedAt,
        expiresAt,
        environment: String(process.env.NODE_ENV ?? "unknown"),
      },
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

import { NextResponse } from "next/server";
import { adminSessionTokenFromRequest, getAdminIdentityBySessionToken } from "@/src/lib/auth/adminSession";
import { requireAuth } from "@/src/auth/requireAuth";

export type AdminTier = "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";

export type AdminIdentityWithTier = {
  userId: string;
  email: string | null;
  tier: AdminTier;
  authSource: "admin_session" | "clerk";
};

function parseEmailAllowlist(raw: string | undefined): Set<string> {
  const s = String(raw ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return new Set(s);
}

const SUPER_EMAILS = parseEmailAllowlist(process.env.ADMIN_SUPER_EMAILS);
const VIEWER_EMAILS = parseEmailAllowlist(process.env.ADMIN_VIEWER_EMAILS);

export function tierFromEmail(email: string | null | undefined): AdminTier {
  const e = String(email ?? "").trim().toLowerCase();
  if (e && SUPER_EMAILS.has(e)) return "ADMIN_SUPER";
  if (e && VIEWER_EMAILS.has(e)) return "ADMIN_VIEWER";
  // Default preserves current admin behavior, but blocks financial overrides unless allowlisted as SUPER.
  return "ADMIN_OPERATOR";
}

export function tierLabel(tier: AdminTier): string {
  return tier === "ADMIN_SUPER" ? "SUPER" : tier === "ADMIN_OPERATOR" ? "OPERATOR" : "VIEWER";
}

export function tierGte(actual: AdminTier, required: AdminTier): boolean {
  const rank = (t: AdminTier) => (t === "ADMIN_VIEWER" ? 0 : t === "ADMIN_OPERATOR" ? 1 : 2);
  return rank(actual) >= rank(required);
}

export async function requireAdminIdentityWithTier(req: Request): Promise<NextResponse | AdminIdentityWithTier> {
  // Preferred: admin_session cookie (apps/admin). We intentionally do NOT hard-code "role === ADMIN" here
  // so tiers can be expressed out-of-band (currently via email allowlists).
  const token = adminSessionTokenFromRequest(req);
  if (token) {
    const admin = await getAdminIdentityBySessionToken(token).catch(() => null);
    if (admin?.id) {
      const email = admin.email ? String(admin.email) : null;
      return {
        userId: String(admin.id),
        email,
        tier: tierFromEmail(email),
        authSource: "admin_session",
      };
    }
  }

  // Fallback: Clerk-based auth (if present). We keep this path compatible with existing ADMIN auth.
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed as NextResponse;
  const user = authed.internalUser;
  if (!user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const role = String(user?.role ?? "").trim().toUpperCase();
  if (role !== "ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const email = user?.email ? String(user.email) : null;
  return {
    userId: String(user.id),
    email,
    tier: tierFromEmail(email),
    authSource: "clerk",
  };
}

export function enforceTier(identity: AdminIdentityWithTier, required: AdminTier): NextResponse | null {
  if (tierGte(identity.tier, required)) return null;
  return NextResponse.json(
    {
      ok: false,
      error: "forbidden",
      requiredTier: required,
      actualTier: identity.tier,
    },
    { status: 403 },
  );
}


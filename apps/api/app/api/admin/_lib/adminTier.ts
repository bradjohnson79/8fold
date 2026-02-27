import { NextResponse } from "next/server";
import { requireAdminClerk } from "@/src/lib/auth/requireAdminClerk";

export type AdminTier = "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";

export type AdminIdentityWithTier = {
  userId: string;
  email: string | null;
  adminRole: string;
  tier: AdminTier;
  authSource: "clerk";
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

function tierFromAdminRole(role: string | null | undefined): AdminTier | null {
  const r = String(role ?? "").trim().toUpperCase();
  if (r === "ADMIN_SUPER") return "ADMIN_SUPER";
  if (r === "ADMIN_OPERATOR") return "ADMIN_OPERATOR";
  if (r === "ADMIN_VIEWER") return "ADMIN_VIEWER";
  return null;
}

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
  const admin = await requireAdminClerk(req);
  if (admin instanceof Response) return admin;
  const email = admin.admin.email ? String(admin.admin.email) : null;
  const tierFromRole = tierFromAdminRole(admin.admin.role);
  return {
    userId: admin.admin.id,
    email,
    adminRole: admin.admin.role,
    tier: tierFromRole ?? tierFromEmail(email),
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

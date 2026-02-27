import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err } from "@/src/lib/api/adminV4Response";

export async function requireAdmin(req: Request): Promise<Response | Awaited<ReturnType<typeof requireAdminV4>>> {
  return await requireAdminV4(req);
}

export type AdminTier = "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";

function parseEmailAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
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

function tierFromEmail(email: string | null | undefined): AdminTier {
  const e = String(email ?? "").trim().toLowerCase();
  if (e && SUPER_EMAILS.has(e)) return "ADMIN_SUPER";
  if (e && VIEWER_EMAILS.has(e)) return "ADMIN_VIEWER";
  return "ADMIN_OPERATOR";
}

function tierGte(actual: AdminTier, required: AdminTier): boolean {
  const rank = (t: AdminTier) => (t === "ADMIN_VIEWER" ? 0 : t === "ADMIN_OPERATOR" ? 1 : 2);
  return rank(actual) >= rank(required);
}

export type RequireAdminWithTierOk = Awaited<ReturnType<typeof requireAdminV4>> & {
  tier: AdminTier;
};

export async function requireAdminTier(
  req: Request,
  required: AdminTier,
): Promise<Response | RequireAdminWithTierOk> {
  const admin = await requireAdminV4(req);
  if (admin instanceof Response) return admin;

  const tier = tierFromAdminRole(admin.role) ?? tierFromEmail(admin.email);
  if (!tierGte(tier, required)) {
    return err(403, "ADMIN_V4_FORBIDDEN", `Requires ${required}`);
  }

  return { ...admin, tier };
}

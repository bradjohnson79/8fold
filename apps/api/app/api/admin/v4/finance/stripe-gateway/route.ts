import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { runStripeIntegrityCheck } from "@/src/services/financialIntegrityEngine";
import { computeStripeRevenueSummary, type StripeIntegrityRange } from "@/src/services/stripeIntegrityService";

type AdminTier = "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";
type DateRangePreset = "24h" | "7d" | "30d" | "custom";

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

function isAdminSuper(role: string | null | undefined, email: string | null | undefined): boolean {
  const tier = tierFromAdminRole(role) ?? tierFromEmail(email);
  return tier === "ADMIN_SUPER";
}

function parseDate(text: string | null): Date | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveRange(searchParams: URLSearchParams): { preset: DateRangePreset; range: StripeIntegrityRange } | null {
  const now = new Date();
  const preset = (String(searchParams.get("dateRange") ?? "7d").trim().toLowerCase() || "7d") as DateRangePreset;

  if (preset === "24h") {
    return { preset, range: { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now } };
  }
  if (preset === "7d") {
    return { preset, range: { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now } };
  }
  if (preset === "30d") {
    return { preset, range: { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now } };
  }
  if (preset === "custom") {
    const start = parseDate(searchParams.get("start") ?? searchParams.get("from"));
    const end = parseDate(searchParams.get("end") ?? searchParams.get("to"));
    if (!start || !end) return null;
    if (start.getTime() > end.getTime()) return null;
    return { preset, range: { start, end } };
  }
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  if (!isAdminSuper(authed.role, authed.email)) {
    return err(403, "ADMIN_V4_FORBIDDEN", "Requires ADMIN_SUPER");
  }

  try {
    const { searchParams } = new URL(req.url);
    const resolved = resolveRange(searchParams);
    if (!resolved) {
      return err(400, "ADMIN_V4_STRIPE_GATEWAY_RANGE_INVALID", "Use dateRange=24h|7d|30d or custom with start/end");
    }

    const [summary, discrepancy] = await Promise.all([
      computeStripeRevenueSummary(resolved.range),
      runStripeIntegrityCheck(resolved.range),
    ]);

    return ok({
      dateRange: {
        preset: resolved.preset,
        start: resolved.range.start.toISOString(),
        end: resolved.range.end.toISOString(),
      },
      summary,
      discrepancy,
    });
  } catch (error) {
    return err(
      500,
      "ADMIN_V4_STRIPE_GATEWAY_FAILED",
      error instanceof Error ? error.message : "Failed to load Stripe gateway summary",
    );
  }
}

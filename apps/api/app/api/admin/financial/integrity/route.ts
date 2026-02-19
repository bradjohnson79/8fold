import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/src/lib/errorHandler";
import { runPayoutIntegrityAuditFromDb } from "@/src/payouts/payoutIntegrityRunner";
import { requireFinancialTier } from "../_lib/requireFinancial";

const QuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(2000).optional(),
  orphanDays: z.coerce.number().int().min(1).max(3650).optional(),
  includeViolations: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v == null ? true : v === "1" || v === "true")),
});

export async function GET(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_OPERATOR");
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      take: url.searchParams.get("take") ?? undefined,
      orphanDays: url.searchParams.get("orphanDays") ?? undefined,
      includeViolations: url.searchParams.get("includeViolations") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = parsed.data.take ?? 500;
    const orphanDays = parsed.data.orphanDays ?? 180;
    const includeViolations = parsed.data.includeViolations;

    const audit = await runPayoutIntegrityAuditFromDb({ take, orphanDays });

    // Sidebar badge uses this value.
    const violationCount = Number((audit as any)?.summary?.violationCount ?? 0);

    return NextResponse.json(
      {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          window: { take, orphanDays },
          summary: {
            ...(audit as any).summary,
            violationCount,
            redBadge: violationCount > 0,
          },
          violations: includeViolations ? (audit as any).violations : undefined,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "GET /api/admin/financial/integrity", { userId: auth.userId });
  }
}


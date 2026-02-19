import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/src/lib/errorHandler";
import { requireFinancialTier } from "../../_lib/requireFinancial";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  transferId: z.string().trim().min(1),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireFinancialTier(req, "ADMIN_SUPER");
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const parsed = BodySchema.safeParse(j.json);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    // Visibility phase only: do not mutate transfer records or call Stripe here.
    // This endpoint exists to validate tier checks + confirmation flow wiring.
    return NextResponse.json(
      {
        ok: true,
        data: {
          transferId: parsed.data.transferId,
          dryRun: parsed.data.dryRun !== false,
          action: "RETRY_TRANSFER_PREVIEW",
          note: "Retry transfer is currently a dry-run preview (no Stripe mutation).",
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "POST /api/admin/financial/payouts/retry", { userId: auth.userId });
  }
}


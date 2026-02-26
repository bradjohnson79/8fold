import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4AdminPayoutAdjustments } from "@/db/schema/v4AdminPayoutAdjustment";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const BodySchema = z.object({
  userId: z.string().trim().min(1),
  direction: z.enum(["CREDIT", "DEBIT"]),
  bucket: z.string().trim().min(1),
  amountCents: z.number().int().positive(),
  memo: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid adjustment payload");

  const rows = await db
    .insert(v4AdminPayoutAdjustments)
    .values({
      adminId: authed.adminId,
      userId: parsed.data.userId,
      direction: parsed.data.direction,
      bucket: parsed.data.bucket,
      amountCents: parsed.data.amountCents,
      memo: parsed.data.memo ?? null,
    })
    .returning();

  return ok({ adjustment: rows[0] ?? null }, 201);
}

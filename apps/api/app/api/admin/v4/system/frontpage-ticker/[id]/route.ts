import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4FrontpageTickerMessages } from "@/db/schema/v4FrontpageTicker";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const PatchSchema = z.object({
  message: z.string().trim().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(1).max(5).optional(),
  intervalSeconds: z.number().int().min(1).max(120).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid ticker message payload");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.message != null) patch.message = parsed.data.message;
  if (parsed.data.isActive != null) patch.isActive = parsed.data.isActive;
  if (parsed.data.displayOrder != null) patch.displayOrder = parsed.data.displayOrder;
  if (parsed.data.intervalSeconds != null) patch.intervalSeconds = parsed.data.intervalSeconds;

  const rows = await db
    .update(v4FrontpageTickerMessages)
    .set(patch)
    .where(eq(v4FrontpageTickerMessages.id, id))
    .returning();

  const message = rows[0] ?? null;
  if (!message) return err(404, "ADMIN_V4_TICKER_NOT_FOUND", "Ticker message not found");

  return ok({ message });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;

  const rows = await db
    .delete(v4FrontpageTickerMessages)
    .where(eq(v4FrontpageTickerMessages.id, id))
    .returning();

  if (!rows.length) return err(404, "ADMIN_V4_TICKER_NOT_FOUND", "Ticker message not found");

  return ok({ deleted: true });
}

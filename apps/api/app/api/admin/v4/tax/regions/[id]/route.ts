import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4TaxRegions } from "@/db/schema/v4TaxRegion";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const PatchSchema = z.object({
  countryCode: z.string().trim().length(2).optional(),
  regionCode: z.string().trim().min(1).max(8).optional(),
  regionName: z.string().trim().min(1).max(100).optional(),
  combinedRate: z.number().min(0).max(2).optional(),
  gstRate: z.number().min(0).max(2).optional(),
  pstRate: z.number().min(0).max(2).optional(),
  hstRate: z.number().min(0).max(2).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid tax region payload");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.countryCode != null) patch.countryCode = parsed.data.countryCode.toUpperCase();
  if (parsed.data.regionCode != null) patch.regionCode = parsed.data.regionCode.toUpperCase();
  if (parsed.data.regionName != null) patch.regionName = parsed.data.regionName;
  if (parsed.data.combinedRate != null) patch.combinedRate = String(parsed.data.combinedRate);
  if (parsed.data.gstRate != null) patch.gstRate = String(parsed.data.gstRate);
  if (parsed.data.pstRate != null) patch.pstRate = String(parsed.data.pstRate);
  if (parsed.data.hstRate != null) patch.hstRate = String(parsed.data.hstRate);
  if (parsed.data.active != null) patch.active = parsed.data.active;

  const rows = await db.update(v4TaxRegions).set(patch).where(and(eq(v4TaxRegions.id, id))).returning();
  const region = rows[0] ?? null;
  if (!region) return err(404, "ADMIN_V4_TAX_REGION_NOT_FOUND", "Tax region not found");

  return ok({ region });
}

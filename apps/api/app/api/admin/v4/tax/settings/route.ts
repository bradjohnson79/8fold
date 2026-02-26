import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { v4TaxSettings } from "@/db/schema/v4TaxSetting";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

const PatchSchema = z.object({
  taxMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
  autoApplyCanada: z.boolean().optional(),
  applyToPlatformFee: z.boolean().optional(),
});

async function getOrCreateSettings() {
  const rows = await db.select().from(v4TaxSettings).where(eq(v4TaxSettings.id, "default")).limit(1);
  if (rows[0]) return rows[0];

  const created = await db
    .insert(v4TaxSettings)
    .values({
      id: "default",
      taxMode: "EXCLUSIVE",
      autoApplyCanada: true,
      applyToPlatformFee: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created[0]!;
}

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const settings = await getOrCreateSettings();
  return ok({ settings });
}

export async function PATCH(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return err(400, "ADMIN_V4_INVALID_REQUEST", "Invalid tax settings payload");

  await getOrCreateSettings();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.taxMode != null) patch.taxMode = parsed.data.taxMode;
  if (parsed.data.autoApplyCanada != null) patch.autoApplyCanada = parsed.data.autoApplyCanada;
  if (parsed.data.applyToPlatformFee != null) patch.applyToPlatformFee = parsed.data.applyToPlatformFee;

  const rows = await db.update(v4TaxSettings).set(patch).where(eq(v4TaxSettings.id, "default")).returning();
  const settings = rows[0] ?? null;
  if (!settings) return err(500, "ADMIN_V4_TAX_SETTINGS_SAVE_FAILED", "Failed to save tax settings");

  return ok({ settings });
}

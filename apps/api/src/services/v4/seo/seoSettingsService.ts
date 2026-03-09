import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { seoSettings } from "@/db/schema/seoSettings";

const SEO_SETTINGS_ROW_ID = "singleton";

export type SeoSettingsRow = typeof seoSettings.$inferSelect;
export type SeoSettingsUpdate = Partial<Omit<SeoSettingsRow, "id" | "updatedAt">>;

export async function getSeoSettings(): Promise<SeoSettingsRow | null> {
  const rows = await db.select().from(seoSettings).limit(1);
  return rows[0] ?? null;
}

export async function upsertSeoSettings(updates: SeoSettingsUpdate): Promise<SeoSettingsRow> {
  const existing = await getSeoSettings();
  const id = existing?.id ?? SEO_SETTINGS_ROW_ID;

  const [row] = await db
    .insert(seoSettings)
    .values({
      id,
      ...updates,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: seoSettings.id,
      set: {
        ...updates,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error("Failed to upsert seo_settings");
  return row;
}

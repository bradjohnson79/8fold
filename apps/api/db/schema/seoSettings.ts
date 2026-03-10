import { index, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const seoSettings = dbSchema.table(
  "seo_settings",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    metaPixelId: text("meta_pixel_id"),
    ga4MeasurementId: text("ga4_measurement_id"),
    indexNowKey: text("index_now_key"),
    canonicalDomain: text("canonical_domain"),
    robotsTxt: text("robots_txt"),
    ogImage: text("og_image"),
    twitterCardImage: text("twitter_card_image"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => ({
    updatedAtIdx: index("seo_settings_updated_at_idx").on(t.updatedAt),
  }),
);

export type SeoSettings = typeof seoSettings.$inferSelect;
export type SeoSettingsUpdate = typeof seoSettings.$inferInsert;

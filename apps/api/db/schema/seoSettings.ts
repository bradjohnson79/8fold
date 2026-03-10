import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const seoSettings = dbSchema.table(
  "seo_settings",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    // Page-level metadata
    siteTitle: text("site_title"),
    siteDescription: text("site_description"),
    defaultMetaTitle: text("default_meta_title"),
    defaultMetaDescription: text("default_meta_description"),
    // Open Graph
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImage: text("og_image"),
    // Social
    twitterCardImage: text("twitter_card_image"),
    // Domain + crawl control
    canonicalDomain: text("canonical_domain"),
    robotsTxt: text("robots_txt"),
    // Advanced config (JSON blobs)
    pageTemplates: jsonb("page_templates"),
    distributionConfig: jsonb("distribution_config"),
    trackingEvents: jsonb("tracking_events"),
    // Tracking IDs
    ga4MeasurementId: text("ga4_measurement_id"),
    metaPixelId: text("meta_pixel_id"),
    // IndexNow
    indexNowKey: text("index_now_key"),
    // Audit
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => ({
    updatedAtIdx: index("seo_settings_updated_at_idx").on(t.updatedAt),
  }),
);

export type SeoSettings = typeof seoSettings.$inferSelect;
export type SeoSettingsUpdate = typeof seoSettings.$inferInsert;

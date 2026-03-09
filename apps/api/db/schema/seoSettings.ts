import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const seoSettings = dbSchema.table("seo_settings", {
  id: text("id").primaryKey(),
  siteTitle: text("site_title"),
  siteDescription: text("site_description"),
  defaultMetaTitle: text("default_meta_title"),
  defaultMetaDescription: text("default_meta_description"),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImage: text("og_image"),
  twitterCardImage: text("twitter_card_image"),
  canonicalDomain: text("canonical_domain"),
  robotsTxt: text("robots_txt"),
  pageTemplates: jsonb("page_templates"),
  distributionConfig: jsonb("distribution_config"),
  trackingEvents: jsonb("tracking_events"),
  ga4MeasurementId: text("ga4_measurement_id"),
  metaPixelId: text("meta_pixel_id"),
  indexNowKey: text("index_now_key"),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

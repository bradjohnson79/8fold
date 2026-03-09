import { integer, pgEnum, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const seoSitemapTypeEnum = pgEnum("seo_sitemap_type", [
  "index",
  "jobs",
  "services",
  "contractors",
  "cities",
]);

export const seoSitemapCache = dbSchema.table(
  "seo_sitemap_cache",
  {
    id: text("id").primaryKey(),
    sitemapType: seoSitemapTypeEnum("sitemap_type").notNull(),
    xmlContent: text("xml_content").notNull(),
    urlCount: integer("url_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sitemapTypeUq: uniqueIndex("seo_sitemap_cache_type_uq").on(t.sitemapType),
  }),
);

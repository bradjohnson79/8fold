import { jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const seoPageGenerationQueue = dbSchema.table(
  "seo_page_generation_queue",
  {
    id: text("id").primaryKey(),
    city: text("city").notNull(),
    service: text("service").notNull(),
    slug: text("slug").notNull(),                  // e.g. "vancouver/handyman"
    templateType: text("template_type").notNull(), // "city-service" | "city" | "service"
    status: text("status").notNull().default("pending"), // "pending" | "generated" | "published" | "error"
    previewData: jsonb("preview_data"),    // { metaTitle, metaDescription, canonicalUrl, exampleLayout }
    generatedContent: jsonb("generated_content"),
    requestedBy: text("requested_by"),             // admin user id
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { mode: "date", withTimezone: true }),
  },
  (t) => ({
    slugUq: uniqueIndex("seo_page_unique_slug").on(t.slug),
  }),
);

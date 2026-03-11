import { text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const seoTemplates = dbSchema.table(
  "seo_templates",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    templateKey: text("template_key").notNull().unique(),
    titleTemplate: text("title_template").notNull(),
    descriptionTemplate: text("description_template").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templateKeyUq: uniqueIndex("seo_templates_template_key_uq").on(t.templateKey),
  }),
);

export type SeoTemplate = typeof seoTemplates.$inferSelect;
export type SeoTemplateInsert = typeof seoTemplates.$inferInsert;

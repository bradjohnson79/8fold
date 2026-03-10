import { index, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const seoIndexQueue = dbSchema.table(
  "seo_index_queue",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    url: text("url").notNull(),
    // CREATE = new job published, UPDATE = job details changed, DELETE = job archived/deleted
    action: text("action", { enum: ["CREATE", "UPDATE", "DELETE"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    urlIdx: index("seo_index_queue_url_idx").on(t.url),
    processedAtIdx: index("seo_index_queue_processed_at_idx").on(t.processedAt),
  }),
);

export type SeoIndexQueueItem = typeof seoIndexQueue.$inferSelect;

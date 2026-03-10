import { index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const seoIndexingLog = dbSchema.table(
  "seo_indexing_log",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    engine: text("engine").notNull(),      // "google" | "indexnow"
    status: text("status").notNull(),      // "success" | "error"
    responseCode: integer("response_code"),
    errorMessage: text("error_message"),
    triggeredBy: text("triggered_by"),     // "manual" | "JOB_PUBLISHED" | domain event type
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engineCreatedIdx: index("seo_indexing_log_engine_created_idx").on(t.engine, t.createdAt),
    statusCreatedIdx: index("seo_indexing_log_status_created_idx").on(t.status, t.createdAt),
    createdIdx: index("seo_indexing_log_created_idx").on(t.createdAt),
  }),
);

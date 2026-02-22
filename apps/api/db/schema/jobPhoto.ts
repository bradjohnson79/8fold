import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Production: public.job_photos. TS camelCase, DB snake_case.
export const jobPhotos = dbSchema.table("job_photos", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  kind: text("kind").notNull(),
  actor: text("actor"),
  url: text("url"),
  storageKey: text("storage_key"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobPhoto` table (minimal fields for public reads).
export const jobPhotos = dbSchema.table("JobPhoto", {
  id: text("id").primaryKey(),
  jobId: text("jobId").notNull(),
  kind: text("kind").notNull(),
  actor: text("actor"),
  url: text("url"),
  storageKey: text("storageKey"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});


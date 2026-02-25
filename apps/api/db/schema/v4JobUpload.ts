import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4JobUploads = dbSchema.table("v4_job_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { mode: "date" }),
});

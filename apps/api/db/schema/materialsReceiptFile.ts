import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const materialsReceiptFiles = dbSchema.table("MaterialsReceiptFile", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  submissionId: text("submissionId").notNull(),
  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  sha256: text("sha256"),
});


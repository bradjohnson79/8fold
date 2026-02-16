import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `SupportAttachment` table (minimal fields for support reads).
export const supportAttachments = dbSchema.table("support_attachments", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  ticketId: text("ticketId").notNull(),
  uploadedById: text("uploadedById").notNull(),

  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  sha256: text("sha256"),
});


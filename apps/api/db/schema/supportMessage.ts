import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `SupportMessage` table (minimal fields for router notifications).
export const supportMessages = dbSchema.table("support_messages", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  ticketId: text("ticketId").notNull(),
  authorId: text("authorId").notNull(),
  message: text("message").notNull(),
});


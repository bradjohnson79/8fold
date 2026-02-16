import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { sendBlockedReasonEnum, sendQueueStatusEnum } from "./enums";

// Mirrors Prisma `SendQueue` model (@@map("send_queue")).
// Only includes columns used in admin/runtime reads/writes.
export const sendQueue = dbSchema.table("send_queue", {
  id: text("id").primaryKey(),

  emailDraftId: text("emailDraftId").notNull(),
  emailIdentityId: text("emailIdentityId").notNull(),

  scheduledFor: timestamp("scheduledFor", { mode: "date" }).notNull(),
  sentAt: timestamp("sentAt", { mode: "date" }),

  status: sendQueueStatusEnum("status").notNull().default("QUEUED"),
  blockedReason: sendBlockedReasonEnum("blockedReason"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});


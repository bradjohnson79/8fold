import { jsonb, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Dispute votes (admin decisions + AI advisory recommendations + structured inputs).
export const disputeVotes = dbSchema.table("dispute_votes", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  disputeCaseId: text("disputeCaseId").notNull(),

  voterType: text("voterType").notNull(), // e.g. ADMIN, AI_GPT5_NANO, USER
  voterUserId: text("voterUserId"), // nullable for AI/system votes

  // Votes are immutable; only AI advisory votes may be superseded (new row + old row marked SUPERSEDED).
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUPERSEDED

  vote: text("vote").notNull(), // e.g. SUPPORT_FILED_BY, SUPPORT_AGAINST, NEUTRAL
  rationale: text("rationale"),

  model: text("model"),
  confidence: integer("confidence"),
  payload: jsonb("payload"),
});


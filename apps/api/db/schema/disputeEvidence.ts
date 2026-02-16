import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Dispute evidence (user/admin submitted artifacts, links, notes).
export const disputeEvidence = dbSchema.table("dispute_evidence", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  disputeCaseId: text("disputeCaseId").notNull(),
  submittedByUserId: text("submittedByUserId").notNull(),

  kind: text("kind").notNull(), // e.g. "PHOTO", "RECEIPT", "MESSAGE", "NOTE"
  summary: text("summary"),
  url: text("url"),
  metadata: jsonb("metadata"),
});


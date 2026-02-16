import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const jobPosterCredits = dbSchema.table("JobPosterCredit", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull(),
  escrowId: text("escrowId"),
  amountCents: integer("amountCents").notNull(),
  memo: text("memo"),
});


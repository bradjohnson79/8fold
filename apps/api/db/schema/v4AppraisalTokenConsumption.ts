import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AppraisalTokenConsumptions = dbSchema.table("v4_appraisal_token_consumptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  consumedAt: timestamp("consumed_at", { mode: "date" }).notNull().defaultNow(),
  jobId: text("job_id").notNull(),
});

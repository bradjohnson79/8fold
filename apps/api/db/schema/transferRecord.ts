import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { users } from "./user";

export const transferRecords = dbSchema.table("TransferRecord", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("jobId")
    .notNull()
    .references(() => jobs.id),
  role: text("role").notNull(), // CONTRACTOR | ROUTER | PLATFORM
  userId: text("userId")
    .notNull()
    .references(() => users.id),
  amountCents: integer("amountCents").notNull(),
  currency: text("currency").notNull(), // "USD" | "CAD"
  method: text("method").notNull(), // "STRIPE" | "PAYPAL"
  stripeTransferId: text("stripeTransferId"),
  externalRef: text("externalRef"),
  status: text("status").notNull(), // "PENDING" | "SENT" | "FAILED" | "REVERSED"
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp("releasedAt", { withTimezone: true }),
  failureReason: text("failureReason"),
});


import { index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const v4FinancialLedger = dbSchema.table(
  "v4_financial_ledger",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    type: text("type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("CAD"),
    stripeRef: text("stripe_ref"),
    dedupeKey: text("dedupe_key"),
    metaJson: jsonb("meta_json"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobCreatedIdx: index("v4_financial_ledger_job_created_idx").on(t.jobId, t.createdAt),
    typeCreatedIdx: index("v4_financial_ledger_type_created_idx").on(t.type, t.createdAt),
    stripeRefIdx: index("v4_financial_ledger_stripe_ref_idx").on(t.stripeRef),
    dedupeKeyUq: uniqueIndex("v4_financial_ledger_dedupe_key_uq")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    jobTypeStripeRefUq: uniqueIndex("v4_financial_ledger_job_type_ref_uq")
      .on(t.jobId, t.type, t.stripeRef)
      .where(sql`${t.stripeRef} is not null`),
  }),
);

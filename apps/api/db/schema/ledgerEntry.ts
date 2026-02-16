import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, ledgerBucketEnum, ledgerDirectionEnum, ledgerEntryTypeEnum } from "./enums";
import { jobs } from "./job";
import { escrows } from "./escrow";

// Bank-ledger hardened `LedgerEntry` (still includes wallet columns used by the app).
export const ledgerEntries = dbSchema.table("LedgerEntry", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull(),
  jobId: text("jobId").references(() => jobs.id),
  escrowId: uuid("escrowId").references(() => escrows.id),

  type: ledgerEntryTypeEnum("type").notNull(),
  direction: ledgerDirectionEnum("direction").notNull(),
  bucket: ledgerBucketEnum("bucket").notNull(),
  amountCents: integer("amountCents").notNull(),
  currency: currencyCodeEnum("currency").notNull().default("USD"),
  stripeRef: text("stripeRef"),

  memo: text("memo"),
});


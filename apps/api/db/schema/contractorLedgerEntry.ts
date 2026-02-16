import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { contractorLedgerBucketEnum, contractorLedgerEntryTypeEnum } from "./enums";

export const contractorLedgerEntries = dbSchema.table("ContractorLedgerEntry", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  contractorId: text("contractorId").notNull(),
  jobId: text("jobId"),

  type: contractorLedgerEntryTypeEnum("type").notNull(),
  bucket: contractorLedgerBucketEnum("bucket").notNull(),
  amountCents: integer("amountCents").notNull(),
  memo: text("memo"),
});


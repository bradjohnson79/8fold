import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsEscrowLedgerEntryTypeEnum } from "./enums";

export const materialsEscrowLedgerEntries = dbSchema.table("MaterialsEscrowLedgerEntry", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  escrowId: text("escrowId").notNull(),
  type: materialsEscrowLedgerEntryTypeEnum("type").notNull(),
  amountCents: integer("amountCents").notNull(),
  currency: currencyCodeEnum("currency").notNull().default("USD"),

  memo: text("memo"),
  actorUserId: text("actorUserId"),
});


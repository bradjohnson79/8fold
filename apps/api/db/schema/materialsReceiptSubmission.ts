import { integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsReceiptStatusEnum } from "./enums";

export const materialsReceiptSubmissions = dbSchema.table("MaterialsReceiptSubmission", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  status: materialsReceiptStatusEnum("status").notNull().default("DRAFT"),
  requestId: text("requestId").notNull(),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  receiptSubtotalCents: integer("receiptSubtotalCents").notNull().default(0),
  receiptTaxCents: integer("receiptTaxCents").notNull().default(0),
  receiptTotalCents: integer("receiptTotalCents").notNull().default(0),

  merchantName: text("merchantName"),
  purchaseDate: timestamp("purchaseDate", { mode: "date" }),

  extractionModel: text("extractionModel"),
  extractionRaw: jsonb("extractionRaw"),

  submittedAt: timestamp("submittedAt", { mode: "date" }),
});


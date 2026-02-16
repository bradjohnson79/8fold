import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { contractorStatusEnum, contractorTradeEnum, countryCodeEnum, tradeCategoryEnum } from "./enums";

// Mirrors Prisma `Contractor` table (route-scoped minimal fields for reads).
export const contractors = dbSchema.table("Contractor", {
  id: text("id").primaryKey(),
  // DB authoritative: enum ContractorStatus NOT NULL default PENDING
  status: contractorStatusEnum("status").notNull().default("PENDING"),

  businessName: text("businessName").notNull(),
  contactName: text("contactName"),
  yearsExperience: integer("yearsExperience").notNull().default(3),
  phone: text("phone"),
  email: text("email"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  approvedAt: timestamp("approvedAt", { mode: "date" }),

  country: countryCodeEnum("country").notNull().default("US"),
  regionCode: text("regionCode").notNull(),

  // DB authoritative: enum ContractorTrade NOT NULL
  trade: contractorTradeEnum("trade").notNull(),
  categories: text("categories").array(),

  // v1 controlled categories (multi-select). Canonical eligibility list.
  // NOTE: In Postgres this is backed by Prisma enum type `"TradeCategory"[]`.
  tradeCategories: tradeCategoryEnum("tradeCategories").array(),

  automotiveEnabled: boolean("automotiveEnabled").notNull().default(false),

  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  regions: text("regions").array(),

  // Stripe connect (optional)
  stripeAccountId: text("stripeAccountId"),
  stripePayoutsEnabled: boolean("stripePayoutsEnabled").notNull().default(false),
});


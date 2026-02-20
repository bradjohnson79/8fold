import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum } from "./enums";

// Mirrors Prisma `ContractorAccount` model (table: contractor_accounts).
// This table is the authenticated contractor profile surface.
export const contractorAccounts = dbSchema.table("contractor_accounts", {
  userId: text("userId").primaryKey(),

  createdByAdmin: boolean("createdByAdmin").default(false),
  isActive: boolean("isActive").default(true),
  isMock: boolean("isMock").default(false),
  isTest: boolean("isTest").default(false),

  // Wizard / eligibility (columns may be added via migrations; keep nullable/default-safe).
  status: text("status"),
  wizardCompleted: boolean("wizardCompleted").notNull().default(false),
  waiverAccepted: boolean("waiverAccepted").notNull().default(false),
  waiverAcceptedAt: timestamp("waiverAcceptedAt", { withTimezone: true }),

  firstName: text("firstName"),
  lastName: text("lastName"),
  businessName: text("businessName"),
  businessNumber: text("businessNumber"),

  addressMode: text("addressMode"),
  addressSearchDisplayName: text("addressSearchDisplayName"),
  address1: text("address1"),
  address2: text("address2"),
  apt: text("apt"),
  postalCode: text("postalCode"),

  tradeCategory: text("tradeCategory"),
  serviceRadiusKm: integer("serviceRadiusKm").default(25),

  country: countryCodeEnum("country").default("US"),
  regionCode: text("regionCode"),
  city: text("city"),

  tradeStartYear: integer("tradeStartYear"),
  tradeStartMonth: integer("tradeStartMonth"),

  payoutMethod: text("payoutMethod"),
  payoutStatus: text("payoutStatus"),
  stripeAccountId: text("stripeAccountId"),

  isApproved: boolean("isApproved").default(false),
  jobsCompleted: integer("jobsCompleted").default(0),
  rating: doublePrecision("rating"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});


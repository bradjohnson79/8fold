import { doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum, rolePayoutMethodEnum, rolePayoutStatusEnum } from "./enums";

// Mirrors Prisma `JobPosterProfile` table (minimal fields for Stripe `account.updated` payout updates).
export const jobPosterProfiles = dbSchema.table("JobPosterProfile", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull().unique(),

  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city").notNull(),
  stateProvince: text("stateProvince").notNull(),
  postalCode: text("postalCode"),
  country: countryCodeEnum("country").notNull().default("US"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  defaultJobLocation: text("defaultJobLocation"),

  payoutMethod: rolePayoutMethodEnum("payoutMethod"),
  payoutStatus: rolePayoutStatusEnum("payoutStatus").notNull().default("UNSET"),
  stripeAccountId: text("stripeAccountId"),
});


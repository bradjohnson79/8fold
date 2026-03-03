import { doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { countryCodeEnum, userRoleEnum, userStatusEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `User` table (only fields referenced by jobs/drafts).
export const users = dbSchema.table("User", {
  // DB authoritative: text NOT NULL default (gen_random_uuid())::text
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),

  // Clerk is the sole identity authority. Internal auth flow must key by clerkUserId.
  clerkUserId: text("clerkUserId").notNull().unique(),
  authUserId: text("authUserId").unique(),
  email: text("email").unique(),
  // Production canonical column name is phoneNumber; keep property key `phone` for back-compat.
  phone: text("phoneNumber"),
  name: text("name"),

  // Canonical role taxonomy: JOB_POSTER | ROUTER | CONTRACTOR | ADMIN
  role: userRoleEnum("role").notNull(),
  status: userStatusEnum("status").notNull().default("ACTIVE"),

  // Router rewards: referral attribution (set once at signup).
  referredByRouterId: text("referredByRouterId"),

  // Canonical geocoded location (required by address autocomplete flows).
  // Nullable; no default. Application rejects (0,0) on save.
  formattedAddress: text("formattedAddress").notNull().default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  // Legal address (manual; not validated against OSM).
  legalStreet: text("legalStreet").notNull().default(""),
  legalCity: text("legalCity").notNull().default(""),
  legalProvince: text("legalProvince").notNull().default(""),
  legalPostalCode: text("legalPostalCode").notNull().default(""),
  legalCountry: text("legalCountry").notNull().default("US"),

  // Account lifecycle (soft controls; never hard-delete financial data)
  accountStatus: text("accountStatus").notNull().default("ACTIVE"),
  suspendedUntil: timestamp("suspendedUntil", { mode: "date" }),
  suspensionReason: text("suspensionReason"),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  archivedReason: text("archivedReason"),
  archivedByAdminId: text("archivedByAdminId"),
  deletionReason: text("deletionReason"),
  updatedByAdminId: text("updatedByAdminId"),

  country: countryCodeEnum("country").notNull().default("US"),
  countryCode: countryCodeEnum("countryCode").notNull().default("US"),
  stateCode: text("stateCode").notNull().default(""),

  // V4 Job Poster: TOS audit trail (nullable for existing rows)
  tosVersion: text("tosVersion"),
  acceptedTosAt: timestamp("acceptedTosAt", { mode: "date" }),

  // V4 Job Poster: Stripe payment (nullable; single source of truth on users)
  stripeCustomerId: text("stripeCustomerId"),
  stripeDefaultPaymentMethodId: text("stripeDefaultPaymentMethodId"),
  stripeStatus: text("stripeStatus"),
  stripeUpdatedAt: timestamp("stripeUpdatedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});


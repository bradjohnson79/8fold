import { text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { countryCodeEnum, userRoleEnum, userStatusEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `User` table (only fields referenced by jobs/drafts).
export const users = dbSchema.table("User", {
  // DB authoritative: text NOT NULL default (gen_random_uuid())::text
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),

  authUserId: text("authUserId").unique(),
  email: text("email").unique(),
  phone: text("phone"),
  name: text("name"),

  // Canonical role taxonomy: JOB_POSTER | ROUTER | CONTRACTOR | ADMIN
  role: userRoleEnum("role").notNull().default("JOB_POSTER"),
  status: userStatusEnum("status").notNull().default("ACTIVE"),

  // Router rewards: referral attribution (set once at signup).
  referredByRouterId: text("referredByRouterId"),

  // Account lifecycle (soft controls; never hard-delete financial data)
  accountStatus: text("accountStatus").notNull().default("ACTIVE"),
  suspendedUntil: timestamp("suspendedUntil", { mode: "date" }),
  suspensionReason: text("suspensionReason"),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  archivedReason: text("archivedReason"),
  deletionReason: text("deletionReason"),
  updatedByAdminId: text("updatedByAdminId"),

  country: countryCodeEnum("country").notNull().default("US"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});


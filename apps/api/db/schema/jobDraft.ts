import { text, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { jobDraftStatusEnum, jobTypeEnum, tradeCategoryEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobDraft` table.
export const jobDrafts = dbSchema.table("JobDraft", {
  id: text("id").primaryKey(),
  status: jobDraftStatusEnum("status").notNull().default("DRAFT"),

  title: text("title").notNull(),
  scope: text("scope").notNull(),
  region: text("region").notNull(),
  serviceType: text("serviceType").notNull(),
  tradeCategory: tradeCategoryEnum("tradeCategory"),
  timeWindow: text("timeWindow"),

  routerEarningsCents: integer("routerEarningsCents").notNull(),
  brokerFeeCents: integer("brokerFeeCents").notNull(),
  contractorPayoutCents: integer("contractorPayoutCents").notNull().default(0),

  laborTotalCents: integer("laborTotalCents").notNull().default(0),
  materialsTotalCents: integer("materialsTotalCents").notNull().default(0),
  transactionFeeCents: integer("transactionFeeCents").notNull().default(0),

  jobType: jobTypeEnum("jobType").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  notesInternal: text("notesInternal"),
  priceLockedAt: timestamp("priceLockedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // Prisma `@updatedAt` (application-managed) — no DB default in our schema.
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  createdByAdminUserId: text("createdByAdminUserId"),
  createdByJobPosterUserId: text("createdByJobPosterUserId"),

  publishedJobId: text("publishedJobId").unique(),
});


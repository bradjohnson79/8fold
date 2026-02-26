import { boolean, index, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminJobs = dbSchema.table(
  "v4_admin_jobs",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    country: text("country").notNull(),
    province: text("province"),
    city: text("city"),
    address: text("address"),
    trade: text("trade").notNull(),
    jobSource: text("job_source").notNull().default("REAL"),
    routingStatus: text("routing_status").notNull().default("UNROUTED"),
    archived: boolean("archived").notNull().default(false),
    assignmentId: text("assignment_id"),
    assignmentStatus: text("assignment_status"),
    assignmentContractorId: text("assignment_contractor_id"),
    assignmentContractorName: text("assignment_contractor_name"),
    assignmentContractorEmail: text("assignment_contractor_email"),
    amountCents: integer("amount_cents").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("UNPAID"),
    payoutStatus: text("payout_status").notNull().default("NOT_READY"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    statusIdx: index("v4_admin_jobs_status_idx").on(t.status),
    countryProvinceIdx: index("v4_admin_jobs_country_province_idx").on(t.country, t.province),
    tradeIdx: index("v4_admin_jobs_trade_idx").on(t.trade),
    createdAtIdx: index("v4_admin_jobs_created_at_idx").on(t.createdAt),
  }),
);

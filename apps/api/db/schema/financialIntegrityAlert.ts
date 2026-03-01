import { index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  financialIntegrityAlertStatusEnum,
  financialIntegrityAlertTypeEnum,
  financialIntegritySeverityEnum,
} from "./enums";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";
import { admins } from "./admin";

export const financialIntegrityAlerts = dbSchema.table(
  "financial_integrity_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").references(() => jobs.id),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeTransferId: text("stripe_transfer_id"),
    alertType: financialIntegrityAlertTypeEnum("alert_type").notNull(),
    severity: financialIntegritySeverityEnum("severity").notNull().default("WARNING"),
    internalTotalCents: integer("internal_total_cents").notNull().default(0),
    stripeTotalCents: integer("stripe_total_cents").notNull().default(0),
    differenceCents: integer("difference_cents").notNull().default(0),
    status: financialIntegrityAlertStatusEnum("status").notNull().default("OPEN"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedByAdminId: uuid("resolved_by_admin_id").references(() => admins.id),
  },
  (t) => ({
    statusIdx: index("financial_integrity_alerts_status_idx").on(t.status),
    createdAtIdx: index("financial_integrity_alerts_created_at_idx").on(t.createdAt),
    jobIdIdx: index("financial_integrity_alerts_job_id_idx").on(t.jobId),
  }),
);

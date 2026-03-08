import { index, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";

export const v4JobPriceAdjustments = dbSchema.table(
  "v4_job_price_adjustments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    contractorUserId: text("contractor_user_id").notNull(),
    jobPosterUserId: text("job_poster_user_id").notNull(),
    supportTicketId: text("support_ticket_id"),
    originalPriceCents: integer("original_price_cents").notNull(),
    requestedPriceCents: integer("requested_price_cents").notNull(),
    differenceCents: integer("difference_cents").notNull(),
    contractorScopeDetails: text("contractor_scope_details").notNull(),
    additionalScopeDetails: text("additional_scope_details").notNull(),
    status: text("status").notNull().default("PENDING"),
    secureToken: text("secure_token"),
    tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }),
    generatedByAdminId: text("generated_by_admin_id"),
    generatedAt: timestamp("generated_at", { mode: "date" }),
    paymentIntentId: text("payment_intent_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { mode: "date" }),
  },
  (t) => ({
    jobContractorUniq: uniqueIndex("v4_job_price_adj_job_contractor_uniq").on(
      t.jobId,
      t.contractorUserId,
    ),
    jobIdx: index("v4_job_price_adj_job_idx").on(t.jobId),
    statusIdx: index("v4_job_price_adj_status_idx").on(t.status),
  }),
);

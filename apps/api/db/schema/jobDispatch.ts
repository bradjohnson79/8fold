import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobDispatch` table (minimal fields for routing flows).
export const jobDispatches = dbSchema.table(
  "JobDispatch",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

    status: text("status").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),

    tokenHash: text("tokenHash").notNull(),

    jobId: text("jobId").notNull(),
    contractorId: text("contractorId").notNull(),
    routerUserId: text("routerUserId").notNull(),
  },
  (t) => ({
    tokenHashUniq: uniqueIndex("JobDispatch_tokenHash_key").on(t.tokenHash),
    jobStatusCreatedIdx: index("JobDispatch_jobId_status_createdAt_idx").on(t.jobId, t.status, t.createdAt),
    contractorStatusCreatedIdx: index("JobDispatch_contractorId_status_createdAt_idx").on(t.contractorId, t.status, t.createdAt),
    routerStatusCreatedIdx: index("JobDispatch_routerUserId_status_createdAt_idx").on(t.routerUserId, t.status, t.createdAt),
  }),
);


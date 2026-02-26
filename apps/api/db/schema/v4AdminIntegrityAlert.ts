import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4AdminIntegrityAlerts = dbSchema.table(
  "v4_admin_integrity_alerts",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("MEDIUM"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    statusIdx: index("v4_admin_integrity_alerts_status_idx").on(t.status),
    createdAtIdx: index("v4_admin_integrity_alerts_created_at_idx").on(t.createdAt),
    severityIdx: index("v4_admin_integrity_alerts_severity_idx").on(t.severity),
  }),
);

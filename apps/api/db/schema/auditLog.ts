import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `AuditLog` table (minimal fields for reads).
export const auditLogs = dbSchema.table("AuditLog", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  actorUserId: text("actorUserId"),
  // DB authoritative: uuid NULL
  actorAdminUserId: uuid("actorAdminUserId"),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  metadata: jsonb("metadata"),
});


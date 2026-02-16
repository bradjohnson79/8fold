import { text, timestamp } from "drizzle-orm/pg-core";
import { countryCodeEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `AdminRouterContext` (table: admin_router_contexts) with only fields
// required by non-money routes (e.g., logout deactivation).
export const adminRouterContexts = dbSchema.table("admin_router_contexts", {
  id: text("id").primaryKey(),

  adminId: text("adminId").notNull(),

  country: countryCodeEnum("country").notNull(),
  regionCode: text("regionCode").notNull(),

  routingHubId: text("routingHubId").notNull(),

  activatedAt: timestamp("activatedAt", { mode: "date" }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivatedAt", { mode: "date" }),
});


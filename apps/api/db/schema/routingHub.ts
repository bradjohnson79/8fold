import { boolean, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { countryCodeEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `RoutingHub` (table: routing_hubs) with only fields required by
// admin router-context enter/exit routes.
export const routingHubs = dbSchema.table("routing_hubs", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  country: countryCodeEnum("country").notNull(),
  regionCode: text("regionCode").notNull(),
  hubCity: text("hubCity").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),

  isAdminOnly: boolean("isAdminOnly").notNull().default(true),
});


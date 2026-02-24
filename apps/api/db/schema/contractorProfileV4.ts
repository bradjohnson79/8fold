import { boolean, doublePrecision, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const contractorProfilesV4 = dbSchema.table("contractor_profiles_v4", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  businessName: text("business_name").notNull(),
  tradeCategories: jsonb("trade_categories").notNull(),
  serviceRadiusKm: integer("service_radius_km").notNull(),
  homeLatitude: doublePrecision("home_latitude").notNull(),
  homeLongitude: doublePrecision("home_longitude").notNull(),
  stripeConnected: boolean("stripe_connected").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

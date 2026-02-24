import { doublePrecision, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const routerProfilesV4 = dbSchema.table("router_profiles_v4", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  homeRegion: text("home_region").notNull(),
  serviceAreas: jsonb("service_areas").notNull(),
  availability: jsonb("availability").notNull(),
  homeLatitude: doublePrecision("home_latitude").notNull(),
  homeLongitude: doublePrecision("home_longitude").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

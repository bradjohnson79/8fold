import { doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const jobPosterProfilesV4 = dbSchema.table("job_poster_profiles_v4", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  provinceState: text("province_state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull(),
  formattedAddress: text("formatted_address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  geocodeProvider: text("geocode_provider").notNull().default("OSM"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

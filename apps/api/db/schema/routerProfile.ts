import { doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Router Dashboard Reset: clean RouterProfile model (DB-authoritative).
export const routerProfiles = dbSchema.table("RouterProfile", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),

  // Required profile fields (readiness contract)
  name: text("name"),
  address: text("address"),
  city: text("city"),
  stateProvince: text("stateProvince"),
  postalCode: text("postalCode"),
  country: text("country"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});


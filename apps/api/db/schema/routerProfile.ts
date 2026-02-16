import { boolean, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `RouterProfile` table (minimal fields for router dashboard reads).
export const routerProfiles = dbSchema.table("RouterProfile", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),

  name: text("name"),
  state: text("state"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  status: text("status"),

  addressPrivate: text("addressPrivate"),

  stripeAccountId: text("stripeAccountId"),
  stripePayoutsEnabled: boolean("stripePayoutsEnabled").notNull().default(false),
  payoutMethod: text("payoutMethod"),
  payoutStatus: text("payoutStatus"),
  paypalEmail: text("paypalEmail"),

  notifyViaEmail: boolean("notifyViaEmail"),
  notifyViaSms: boolean("notifyViaSms"),
  phone: text("phone"),

  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});


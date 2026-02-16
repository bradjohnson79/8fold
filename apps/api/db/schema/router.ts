import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum, routerStatusEnum } from "./enums";

// Mirrors Prisma `Router` table (mapped to "routers") with minimal fields for reads.
export const routers = dbSchema.table("routers", {
  userId: text("userId").primaryKey(),

  createdByAdmin: boolean("createdByAdmin").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  isMock: boolean("isMock").notNull().default(false),
  isTest: boolean("isTest").notNull().default(false),

  // Access gating (v1): required for router job routing tools.
  termsAccepted: boolean("termsAccepted").notNull().default(false),
  profileComplete: boolean("profileComplete").notNull().default(false),

  homeCountry: countryCodeEnum("homeCountry").notNull().default("US"),
  homeRegionCode: text("homeRegionCode").notNull(),
  homeCity: text("homeCity"),

  isSeniorRouter: boolean("isSeniorRouter").notNull().default(false),
  dailyRouteLimit: integer("dailyRouteLimit").notNull().default(10),

  routesCompleted: integer("routesCompleted").notNull().default(0),
  routesFailed: integer("routesFailed").notNull().default(0),
  rating: doublePrecision("rating"),

  status: routerStatusEnum("status").notNull().default("ACTIVE"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});


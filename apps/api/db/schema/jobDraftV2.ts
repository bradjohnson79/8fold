import { text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { countryCodeEnum, jobDraftV2StepEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

export const jobDraftV2 = dbSchema.table("JobDraftV2", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),

  countryCode: countryCodeEnum("countryCode").notNull().default("US"),
  stateCode: text("stateCode").notNull().default(""),

  currentStep: jobDraftV2StepEnum("currentStep").notNull().default("PROFILE"),

  data: jsonb("data").notNull().default({}),
  validation: jsonb("validation").notNull().default({}),

  lastSavedAt: timestamp("lastSavedAt", { mode: "date" }),
  version: integer("version").notNull().default(1),

  archivedAt: timestamp("archivedAt", { mode: "date" }),
  jobId: text("jobId"),
  paymentIntentId: text("paymentIntentId"),
  paymentIntentCreatedAt: timestamp("paymentIntentCreatedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

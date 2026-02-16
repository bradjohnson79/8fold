/**
 * DISE (Directory Intelligence & Submission Engine) schema.
 * Namespace: directory_engine
 */
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const directoryEngineSchema = pgSchema("directory_engine");

export const directories = directoryEngineSchema.table("directories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url"),
  submissionUrl: text("submission_url"),
  contactEmail: text("contact_email"),
  region: text("region"),
  country: text("country"),
  category: text("category"), // GENERAL | TRADE | STARTUP | LOCAL | TECH
  scope: text("scope").notNull().default("REGIONAL"), // REGIONAL | NATIONAL
  targetUrlOverride: text("target_url_override"),
  free: boolean("free"),
  requiresApproval: boolean("requires_approval"),
  authorityScore: integer("authority_score"),
  status: text("status").notNull().default("NEW"), // NEW | REVIEWED | APPROVED | REJECTED
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const countryContext = directoryEngineSchema.table("country_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  country: text("country").notNull().unique(),
  keyIndustries: jsonb("key_industries"),
  workforceTrends: jsonb("workforce_trends"),
  tradeDemand: jsonb("trade_demand"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const regionalContext = directoryEngineSchema.table("regional_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  region: text("region").notNull().unique(),
  country: text("country"),
  keyIndustries: jsonb("key_industries"),
  topTrades: jsonb("top_trades"),
  serviceDemand: jsonb("service_demand"),
  populationTraits: jsonb("population_traits"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const submissions = directoryEngineSchema.table("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  directoryId: uuid("directory_id")
    .notNull()
    .references(() => directories.id),
  region: text("region"),
  generatedVariants: jsonb("generated_variants"),
  selectedVariant: text("selected_variant"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | READY | SUBMITTED | APPROVED | REJECTED
  listingUrl: text("listing_url"),
  targetUrlOverride: text("target_url_override"),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const backlinks = directoryEngineSchema.table("backlinks", {
  id: uuid("id").primaryKey().defaultRandom(),
  directoryId: uuid("directory_id")
    .notNull()
    .references(() => directories.id),
  listingUrl: text("listing_url"),
  verified: boolean("verified").notNull().default(false),
  lastChecked: timestamp("last_checked", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

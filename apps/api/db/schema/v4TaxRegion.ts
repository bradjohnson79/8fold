import { boolean, index, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const v4TaxRegions = dbSchema.table(
  "v4_tax_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: text("country_code").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    combinedRate: numeric("combined_rate", { precision: 6, scale: 3 }).notNull().default("0"),
    gstRate: numeric("gst_rate", { precision: 8, scale: 6 }).notNull().default("0"),
    pstRate: numeric("pst_rate", { precision: 8, scale: 6 }).notNull().default("0"),
    hstRate: numeric("hst_rate", { precision: 8, scale: 6 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    countryRegionIdx: index("v4_tax_regions_country_region_idx").on(t.countryCode, t.regionCode),
    countryRegionUnique: unique("v4_tax_regions_country_region_unique").on(t.countryCode, t.regionCode),
    activeIdx: index("v4_tax_regions_active_idx").on(t.active),
  }),
);

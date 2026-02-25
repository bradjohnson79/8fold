import { index, integer, numeric, text } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { v4PmRequests } from "./v4PmRequest";

export const v4PmRequestItems = dbSchema.table(
  "v4_pm_request_items",
  {
    id: text("id").primaryKey(),
    pmRequestId: text("pm_request_id")
      .notNull()
      .references(() => v4PmRequests.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    url: text("url"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  },
  (t) => ({
    pmRequestIdx: index("v4_pm_request_items_pm_request_idx").on(t.pmRequestId),
  })
);

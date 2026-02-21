import { index, integer, numeric, text, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { pmRequests } from "./pmRequest";

export const pmLineItems = dbSchema.table(
  "PmLineItem",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pmRequestId: uuid("pmRequestId")
      .notNull()
      .references(() => pmRequests.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unitPrice", { precision: 12, scale: 2 }).notNull(),
    url: text("url"),
    lineTotal: numeric("lineTotal", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("PmLineItem_pmRequestId_idx").on(t.pmRequestId)]
);

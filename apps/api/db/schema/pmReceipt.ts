import { boolean, index, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { pmRequests } from "./pmRequest";

export const pmReceipts = dbSchema.table(
  "PmReceipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pmRequestId: uuid("pmRequestId")
      .notNull()
      .references(() => pmRequests.id, { onDelete: "cascade" }),
    fileBase64: text("fileBase64").notNull(),
    extractedTotal: numeric("extractedTotal", { precision: 12, scale: 2 }),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("PmReceipt_pmRequestId_idx").on(t.pmRequestId)]
);

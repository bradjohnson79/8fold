import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const materialsItems = dbSchema.table("MaterialsItem", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  requestId: text("requestId").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unitPriceCents").notNull(),
  priceUrl: text("priceUrl"),
  category: text("category").notNull(),
});


import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import {
  supportRoleContextEnum,
  supportTicketCategoryEnum,
  supportTicketPriorityEnum,
  supportTicketStatusEnum,
  supportTicketTypeEnum,
} from "./enums";

// Mirrors Prisma `SupportTicket` table (minimal fields for router notifications).
export const supportTickets = dbSchema.table("support_tickets", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  type: supportTicketTypeEnum("type").notNull(),
  status: supportTicketStatusEnum("status").notNull().default("OPEN"),
  category: supportTicketCategoryEnum("category").notNull(),
  priority: supportTicketPriorityEnum("priority").notNull().default("NORMAL"),

  createdById: text("createdById").notNull(),
  assignedToId: text("assignedToId"),

  roleContext: supportRoleContextEnum("roleContext").notNull(),
  subject: text("subject").notNull(),
});


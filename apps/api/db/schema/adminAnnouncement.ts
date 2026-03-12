import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const adminAnnouncements = dbSchema.table("admin_announcements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  message: text("message").notNull(),
  // "contractors" | "routers" | "job_posters" | "all"
  audienceType: text("audience_type").notNull(),
  // "sent" | "draft" — enables future draft/scheduled support
  status: text("status").notNull().default("sent"),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdBy: text("created_by").notNull(),
  // Nullable — only populated when actually sent
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

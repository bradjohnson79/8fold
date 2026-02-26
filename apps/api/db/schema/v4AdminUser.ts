import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dbSchema } from "./_dbSchema";

export const v4AdminUsers = dbSchema.table(
  "v4_admin_users",
  {
    id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
    authSubjectId: uuid("auth_subject_id").unique(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("ADMIN"),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("ACTIVE"),
    name: text("name"),
    phone: text("phone"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    suspendedUntil: timestamp("suspended_until", { withTimezone: true, mode: "date" }),
    suspensionReason: text("suspension_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    archivedReason: text("archived_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    emailIdx: index("v4_admin_users_email_idx").on(t.email),
    roleIdx: index("v4_admin_users_role_idx").on(t.role),
    statusIdx: index("v4_admin_users_status_idx").on(t.status),
  }),
);

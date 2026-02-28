import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";

export const roleTermsAcceptances = dbSchema.table(
  "role_terms_acceptances",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    documentType: text("document_type").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleDocAcceptedIdx: index("role_terms_acceptances_user_role_doc_accepted_idx").on(
      t.userId,
      t.role,
      t.documentType,
      t.acceptedAt,
    ),
    userRoleDocVersionUq: uniqueIndex("role_terms_acceptances_user_role_doc_version_uq").on(
      t.userId,
      t.role,
      t.documentType,
      t.version,
    ),
  }),
);


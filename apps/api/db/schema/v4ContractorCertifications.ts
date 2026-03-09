import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { users } from "./user";
import { v4ContractorTradeSkills } from "./v4ContractorTradeSkills";

export const v4ContractorCertifications = dbSchema.table("v4_contractor_certifications", {
  id: text("id").primaryKey(),

  contractorUserId: text("contractor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  tradeSkillId: text("trade_skill_id")
    .notNull()
    .references(() => v4ContractorTradeSkills.id, { onDelete: "cascade" }),

  certificationName: text("certification_name").notNull(),

  issuingOrganization: text("issuing_organization"),

  certificateImageUrl: text("certificate_image_url"),

  // Derived from upload MIME: "pdf" | "jpg" | "png" | "webp"
  certificateType: text("certificate_type"),

  // Date the certification was issued (contractor-reported)
  issuedAt: timestamp("issued_at", { mode: "date" }),

  // Set to true by admin verification
  verified: boolean("verified").notNull().default(false),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

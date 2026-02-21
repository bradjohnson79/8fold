import { primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { jobDraftV2FieldStateStatusEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

export const jobDraftV2FieldState = dbSchema.table(
  "JobDraftV2FieldState",
  {
    draftId: text("draftId").notNull(),
    fieldKey: text("fieldKey").notNull(),
    valueHash: text("valueHash"),
    status: jobDraftV2FieldStateStatusEnum("status").notNull().default("idle"),
    savedAt: timestamp("savedAt", { mode: "date" }),
    lastErrorCode: text("lastErrorCode"),
    lastErrorMessage: text("lastErrorMessage"),
  },
  (t) => [primaryKey({ columns: [t.draftId, t.fieldKey] })],
);

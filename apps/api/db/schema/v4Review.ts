import { index, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { jobs } from "./job";

export const v4Reviews = dbSchema.table(
  "v4_reviews",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    jobPosterUserId: text("job_poster_user_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobUniq: uniqueIndex("v4_reviews_job_uniq").on(t.jobId),
    posterIdx: index("v4_reviews_poster_idx").on(t.jobPosterUserId),
    createdAtIdx: index("v4_reviews_created_at_idx").on(t.createdAt),
  }),
);

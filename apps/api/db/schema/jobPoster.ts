import { boolean, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobPoster` model (table: job_posters) used by admin user listings.
export const jobPosters = dbSchema.table("job_posters", {
  userId: text("userId").primaryKey(),

  createdByAdmin: boolean("createdByAdmin").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  isMock: boolean("isMock").notNull().default(false),
  isTest: boolean("isTest").notNull().default(false),

  defaultRegion: text("defaultRegion"),
  totalJobsPosted: integer("totalJobsPosted").notNull().default(0),
  lastJobPostedAt: timestamp("lastJobPostedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});


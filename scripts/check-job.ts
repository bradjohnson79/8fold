import "dotenv/config";
import { db } from "../apps/api/db/drizzle";
import { jobs } from "../apps/api/db/schema/job";
import { jobDispatches } from "../apps/api/db/schema/jobDispatch";
import { eq } from "drizzle-orm";

async function main() {
  const jobId = "cmldztfo7000sonvnkdy96rpo";

  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  console.log("Job:", JSON.stringify(job[0], null, 2));

  const dispatches = await db.select().from(jobDispatches).where(eq(jobDispatches.jobId, jobId));
  console.log("Dispatches:", JSON.stringify(dispatches, null, 2));

  process.exit(0);
}

main().catch(console.error);

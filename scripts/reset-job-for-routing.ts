import "dotenv/config";
import { db } from "../apps/api/db/drizzle";
import { jobs } from "../apps/api/db/schema/job";
import { jobDispatches } from "../apps/api/db/schema/jobDispatch";
import { jobAssignments } from "../apps/api/db/schema/jobAssignment";
import { conversations } from "../apps/api/db/schema/conversation";
import { eq } from "drizzle-orm";

async function main() {
  const jobId = "cmldztfo7000sonvnkdy96rpo";
  
  // Delete all dispatches
  await db.delete(jobDispatches).where(eq(jobDispatches.jobId, jobId));
  console.log("✓ Deleted all dispatches for job");
  
  // Delete all assignments
  await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
  console.log("✓ Deleted all assignments for job");
  
  // Delete all conversations
  await db.delete(conversations).where(eq(conversations.jobId, jobId));
  console.log("✓ Deleted all conversations for job");
  
  // Reset job to OPEN_FOR_ROUTING + UNROUTED
  await db.update(jobs)
    .set({
      status: "OPEN_FOR_ROUTING" as any,
      routingStatus: "UNROUTED" as any,
      claimedByUserId: null,
      claimedAt: null,
      routedAt: null,
      contractorUserId: null,
    })
    .where(eq(jobs.id, jobId));
  
  console.log("✓ Reset job to OPEN_FOR_ROUTING + UNROUTED status");
  process.exit(0);
}

main().catch(console.error);

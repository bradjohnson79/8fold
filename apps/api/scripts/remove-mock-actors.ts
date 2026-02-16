#!/usr/bin/env npx tsx
/**
 * REMOVE ALL MOCK CONTRACTORS & ROUTERS
 *
 * Deletes:
 * - contractor_accounts where isMock=true
 * - contractors linked to those accounts (by user email)
 * - routers where isMock=true
 *
 * Run: npx tsx apps/api/scripts/remove-mock-actors.ts
 * Dry run (default): logs what would be deleted
 * Execute: DRY_RUN=0 npx tsx apps/api/scripts/remove-mock-actors.ts
 */
import "dotenv/config";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { contractorAccounts } from "../db/schema/contractorAccount";
import { contractorLedgerEntries } from "../db/schema/contractorLedgerEntry";
import { contractorPayouts } from "../db/schema/contractorPayout";
import { contractors } from "../db/schema/contractor";
import { jobAssignments } from "../db/schema/jobAssignment";
import { jobDispatches } from "../db/schema/jobDispatch";
import { jobs } from "../db/schema/job";
import { materialsRequests } from "../db/schema/materialsRequest";
import { repeatContractorRequests } from "../db/schema/repeatContractorRequest";
import { routers } from "../db/schema/router";
import { users } from "../db/schema/user";

const DRY_RUN = process.env.DRY_RUN !== "0";

async function main() {
  console.log(DRY_RUN ? "[DRY RUN] Would delete the following:" : "[EXECUTE] Deleting mock actors...\n");

  // 1. Mock contractor accounts
  const mockAccounts = await db
    .select({ userId: contractorAccounts.userId })
    .from(contractorAccounts)
    .where(eq(contractorAccounts.isMock, true));
  const mockUserIds = mockAccounts.map((a) => a.userId);

  // 0. Null contractorUserId for ALL jobs with mock contractor assigned (phantom assignment cleanup)
  if (mockUserIds.length > 0 && !DRY_RUN) {
    const orphaned = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.contractorUserId, mockUserIds));
    if (orphaned.length > 0) {
      await db
        .update(jobs)
        .set({ contractorUserId: null, status: "PUBLISHED" } as any)
        .where(inArray(jobs.contractorUserId, mockUserIds));
      console.log(`  Nulled contractorUserId + reverted status to PUBLISHED for ${orphaned.length} job(s).`);
    }
  }

  if (mockUserIds.length > 0) {
    const mockEmails = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, mockUserIds));
    const emails = mockEmails.map((u) => u.email).filter(Boolean) as string[];

    if (emails.length > 0) {
      const mockContractors = await db
        .select({ id: contractors.id, businessName: contractors.businessName })
        .from(contractors)
        .where(inArray(contractors.email, emails));

      if (mockContractors.length > 0) {
        console.log(`Mock contractors (${mockContractors.length}):`);
        mockContractors.forEach((c) => console.log(`  - ${c.id} (${c.businessName})`));

        const contractorIds = mockContractors.map((c) => c.id);

        // Delete in FK order: dispatches, assignments, materials, ledger, payouts, repeat requests
        if (!DRY_RUN) {
          const assignmentsToDelete = await db
            .select({ jobId: jobAssignments.jobId })
            .from(jobAssignments)
            .where(inArray(jobAssignments.contractorId, contractorIds));
          const jobIds = assignmentsToDelete.map((a) => a.jobId);

          await db.delete(jobDispatches).where(inArray(jobDispatches.contractorId, contractorIds));
          await db.delete(jobAssignments).where(inArray(jobAssignments.contractorId, contractorIds));
          if (jobIds.length > 0) {
            await db
              .update(jobs)
              .set({ contractorUserId: null, status: "PUBLISHED" } as any)
              .where(inArray(jobs.id, jobIds));
          }
          await db.delete(materialsRequests).where(inArray(materialsRequests.contractorId, contractorIds));
          await db.delete(contractorLedgerEntries).where(inArray(contractorLedgerEntries.contractorId, contractorIds));
          await db.delete(contractorPayouts).where(inArray(contractorPayouts.contractorId, contractorIds));
          await db.delete(repeatContractorRequests).where(inArray(repeatContractorRequests.contractorId, contractorIds));
          console.log(`  Deleted: dispatches, assignments, materials, ledger, payouts, repeat requests.`);
          await db.delete(contractors).where(inArray(contractors.id, contractorIds));
          console.log("  Deleted contractors.");
        } else {
          const [a, d, m, l, p, r] = await Promise.all([
            db.select().from(jobAssignments).where(inArray(jobAssignments.contractorId, contractorIds)),
            db.select().from(jobDispatches).where(inArray(jobDispatches.contractorId, contractorIds)),
            db.select().from(materialsRequests).where(inArray(materialsRequests.contractorId, contractorIds)),
            db.select().from(contractorLedgerEntries).where(inArray(contractorLedgerEntries.contractorId, contractorIds)),
            db.select().from(contractorPayouts).where(inArray(contractorPayouts.contractorId, contractorIds)),
            db.select().from(repeatContractorRequests).where(inArray(repeatContractorRequests.contractorId, contractorIds)),
          ]);
          if (a.length || d.length || m.length || l.length || p.length || r.length) {
            console.log(`  Would delete: ${a.length} assignments, ${d.length} dispatches, ${m.length} materials, ${l.length} ledger, ${p.length} payouts, ${r.length} repeat requests.`);
          }
        }
      }

      if (!DRY_RUN) {
        await db.delete(contractorAccounts).where(eq(contractorAccounts.isMock, true));
        console.log("  Deleted mock contractor_accounts.");
      }
    }
  } else {
    console.log("No mock contractor accounts found.");
  }

  // 2. Mock routers
  const mockRouters = await db
    .select({ userId: routers.userId })
    .from(routers)
    .where(eq(routers.isMock, true));

  if (mockRouters.length > 0) {
    console.log(`\nMock routers (${mockRouters.length}):`);
    mockRouters.forEach((r) => console.log(`  - ${r.userId}`));
    if (!DRY_RUN) {
      await db.delete(routers).where(eq(routers.isMock, true));
      console.log("  Deleted mock routers.");
    }
  } else {
    console.log("\nNo mock routers found.");
  }

  // 3. Final verification: any jobs still with contractorUserId?
  const remaining = await db
    .select({ id: jobs.id, contractorUserId: jobs.contractorUserId })
    .from(jobs)
    .where(isNotNull(jobs.contractorUserId));
  if (remaining.length > 0 && !DRY_RUN) {
    console.log(`\nWARNING: ${remaining.length} job(s) still have contractorUserId. Run again or investigate.`);
  }

  console.log(DRY_RUN ? "\n[DRY RUN] Set DRY_RUN=0 to execute." : "\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

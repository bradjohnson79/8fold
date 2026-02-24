#!/usr/bin/env tsx
/** One-off debug: simulate full /api/public/jobs/recent route and surface any error */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { asc, inArray } from "drizzle-orm";
import { db } from "../db/drizzle";
import { jobPhotos } from "../db/schema/jobPhoto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  try {
    const { listNewestJobs, countEligiblePublicJobs } = await import(
      "../src/server/repos/jobPublicRepo.drizzle"
    );
    const limit = 5;
    const jobRows = await listNewestJobs(limit);
    const eligibleCount = await countEligiblePublicJobs();
    console.log("listNewestJobs:", jobRows.length, "countEligible:", eligibleCount);

    const ids = jobRows.map((j) => j.id).filter(Boolean) as string[];
    const photosByJobId = new Map<string, Array<{ id: string; kind: string; url: string | null }>>();
    if (ids.length) {
      const rows = await db
        .select({ jobId: jobPhotos.jobId, id: jobPhotos.id, kind: jobPhotos.kind, url: jobPhotos.url })
        .from(jobPhotos)
        .where(inArray(jobPhotos.jobId, ids))
        .orderBy(asc(jobPhotos.createdAt));
      for (const r of rows) {
        const arr = photosByJobId.get(r.jobId) ?? [];
        arr.push({ id: r.id, kind: r.kind, url: (r as { url?: string | null }).url ?? null });
        photosByJobId.set(r.jobId, arr);
      }
    }

    const jobs = jobRows.map((j) => ({
      id: j.id,
      status: j.status,
      title: j.title,
      region: j.region,
      city: j.city,
      country: j.country,
      publicStatus: j.publicStatus,
      tradeCategory: j.tradeCategory,
      serviceType: "handyman",
      laborTotalCents: j.laborTotalCents,
      contractorPayoutCents: j.contractorPayoutCents,
      routerEarningsCents: j.routerEarningsCents,
      brokerFeeCents: j.brokerFeeCents,
      materialsTotalCents: j.materialsTotalCents,
      transactionFeeCents: j.transactionFeeCents,
      createdAt: j.createdAt,
      photos: photosByJobId.get(j.id) ?? [],
    }));

    const out = jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    }));
    console.log("OK: output", out.length, "jobs");
  } catch (e) {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error("STACK:", e.stack);
    process.exit(1);
  }
}

main();

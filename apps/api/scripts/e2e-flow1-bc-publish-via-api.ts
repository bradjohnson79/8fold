import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { calculatePayoutBreakdown } from "@8fold/shared";

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL not set and apps/api/.env.local not found");
  const txt = fs.readFileSync(p, "utf8");
  const m = txt.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!m) throw new Error("DATABASE_URL missing in apps/api/.env.local");
  process.env.DATABASE_URL = m[1].trim();
}

async function postJson(url: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  ensureDatabaseUrl();

  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db/drizzle");
  const { jobPayments } = await import("../db/schema/jobPayment");
  const { jobs } = await import("../db/schema/job");

  const API = process.env.API_ORIGIN?.trim() || "http://localhost:3003";

  const email = "poster.bc.e2e@8fold.local";
  const otp = "123456";

  // Auth
  const req = await postJson(`${API}/api/auth/request`, { email });
  if (!req.ok) throw new Error(`auth/request failed: ${req.status} ${JSON.stringify(req.json)}`);

  const ver = await postJson(`${API}/api/auth/verify`, { token: otp, role: "job-poster" });
  if (!ver.ok) throw new Error(`auth/verify failed: ${ver.status} ${JSON.stringify(ver.json)}`);
  const sessionToken = String(ver.json?.sessionToken ?? "");
  if (!sessionToken) throw new Error("Missing sessionToken from auth/verify");

  const authHeaders = { "x-session-token": sessionToken };

  // Step: save draft details (Langley, BC)
  const save = await postJson(
    `${API}/api/web/job-poster/drafts/save`,
    {
      jobTitle: "E2E (BC): Handyman work in Langley",
      scope: "Fix door hinges, patch small drywall holes, tighten loose fixtures.",
      tradeCategory: "HANDYMAN",
      jobType: "regional",
      timeWindow: "Within 2 weeks",
      address: {
        street: "20000 56 Ave",
        city: "Langley",
        provinceOrState: "BC",
        country: "CA",
        postalCode: "V3A 1A1",
      },
      geo: { lat: 49.1044, lng: -122.66 },
      // Optional: items/photos (kept empty for deterministic run)
      items: [],
      photoUrls: [],
    },
    authHeaders,
  );
  if (!save.ok) throw new Error(`drafts/save failed: ${save.status} ${JSON.stringify(save.json)}`);
  const jobId = String(save.json?.job?.id ?? "");
  if (!jobId) throw new Error("drafts/save missing job.id");

  // Step: pricing appraisal
  const appr = await postJson(`${API}/api/web/job-poster/drafts/${jobId}/start-appraisal`, {}, authHeaders);
  if (!appr.ok) throw new Error(`start-appraisal failed: ${appr.status} ${JSON.stringify(appr.json)}`);
  const suggestedTotal = Number(appr.json?.job?.aiSuggestedTotal ?? 0);
  const chosenPriceCents = Math.max(10000, Math.round(suggestedTotal || 300) * 100);

  // Step: persist chosen price + capture payment (dev-only fast path).
  const breakdown = calculatePayoutBreakdown(chosenPriceCents, 0);
  const paymentIntentId = `pi_dev_e2e_${jobId}`;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(jobs).set({
      laborTotalCents: chosenPriceCents,
      materialsTotalCents: 0,
      transactionFeeCents: breakdown.transactionFeeCents,
      contractorPayoutCents: breakdown.contractorPayoutCents,
      routerEarningsCents: breakdown.routerEarningsCents,
      brokerFeeCents: breakdown.platformFeeCents,
      // keep status as DRAFT until confirm-payment transitions it
    } as any).where(eq(jobs.id, jobId));

    // Upsert JobPayment row as CAPTURED so confirm-payment can be idempotent without Stripe.
    await tx
      .insert(jobPayments)
      .values({
        id: crypto.randomUUID(),
        jobId,
        stripePaymentIntentId: paymentIntentId,
        stripePaymentIntentStatus: "succeeded",
        stripeChargeId: `ch_dev_e2e_${jobId}`,
        amountCents: breakdown.totalJobPosterPaysCents,
        status: "CAPTURED",
        escrowLockedAt: now,
        paymentCapturedAt: now,
        createdAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: jobPayments.jobId,
        set: {
          stripePaymentIntentId: paymentIntentId,
          stripePaymentIntentStatus: "succeeded",
          stripeChargeId: `ch_dev_e2e_${jobId}`,
          amountCents: breakdown.totalJobPosterPaysCents,
          status: "CAPTURED",
          escrowLockedAt: now,
          paymentCapturedAt: now,
          updatedAt: now,
        } as any,
      });
  });

  // Step: confirm payment (should transition job into OPEN_FOR_ROUTING)
  const conf = await postJson(
    `${API}/api/web/job-poster/jobs/${jobId}/confirm-payment`,
    { paymentIntentId },
    authHeaders,
  );
  if (!conf.ok) throw new Error(`confirm-payment failed: ${conf.status} ${JSON.stringify(conf.json)}`);

  const refreshed = conf.json?.job ?? null;
  const status = String(refreshed?.status ?? "");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jobId,
        chosenPriceCents,
        finalJobStatus: status,
        paymentIntentId,
        paymentStatus: conf.json?.paymentStatus ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


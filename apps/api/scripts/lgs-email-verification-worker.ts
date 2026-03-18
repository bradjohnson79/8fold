/**
 * LGS Email Verification Worker.
 * Runs every 5 minutes. Verifies contractor_leads emails (syntax, DNS, MX, SMTP).
 * Sets verification_score and verification_status. Catch-all → optional_review, score capped at 80.
 *
 *   DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:verification:worker
 */
import path from "node:path";
import cron from "node-cron";
import dotenv from "dotenv";
import EmailValidator from "email-deep-validator";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/drizzle";
import { contractorLeads } from "../db/schema/directoryEngine";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), "apps/api/.env.local") });

const BATCH_SIZE = 20;
const validator = new EmailValidator({ timeout: 8000 });

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function checkCatchAll(domain: string): Promise<boolean> {
  const randomLocal = `random${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const testAddress = `${randomLocal}@${domain}`;
  try {
    const result = await validator.verify(testAddress);
    return result.validMailbox === true;
  } catch {
    return false;
  }
}

async function verifyLead(leadId: string, email: string): Promise<{ score: number; status: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) {
    return { score: 0, status: "blocked" };
  }

  let score = 0;
  let validDomain: boolean | null = null;
  let validMailbox: boolean | null = null;

  try {
    const result = await validator.verify(normalized);
    if (result.wellFormed) score += 20;
    if (result.validDomain) {
      score += 50;
      validDomain = true;
    }
    if (result.validMailbox === true) {
      score += 20;
      validMailbox = true;
    } else if (result.validMailbox === null) {
      score += 10;
    }

    if (validDomain && validMailbox) {
      const domain = normalized.split("@")[1];
      if (domain) {
        const isCatchAll = await checkCatchAll(domain);
        if (isCatchAll) {
          score = Math.min(score, 80);
          return { score, status: "optional_review" };
        }
      }
      score += 10;
    }
  } catch {
    return { score: 0, status: "blocked" };
  }

  if (score >= 85) return { score, status: "verified" };
  if (score >= 70) return { score, status: "optional_review" };
  return { score, status: "blocked" };
}

async function runVerificationCycle(): Promise<number> {
  const rows = await db
    .select({ id: contractorLeads.id, email: contractorLeads.email })
    .from(contractorLeads)
    .where(
      and(
        sql`coalesce(${contractorLeads.verificationScore}, 0) = 0`,
        sql`coalesce(${contractorLeads.emailBounced}, false) = false`,
        sql`${contractorLeads.email} is not null`,
        sql`${contractorLeads.email} != ''`
      )
    )
    .limit(BATCH_SIZE);

  let processed = 0;
  for (const row of rows) {
    const email = row.email ?? "";
    if (!email) continue;
    const { score, status } = await verifyLead(row.id, email);
    await db
      .update(contractorLeads)
      .set({
        verificationScore: score,
        verificationStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(contractorLeads.id, row.id));
    processed++;
  }
  return processed;
}

function runCycle() {
  runVerificationCycle()
    .then((n) => {
      if (n > 0) console.log(`[LGS Verification] processed ${n} lead(s)`);
    })
    .catch((err) => {
      console.error("[LGS Verification] error:", err);
    });
}

cron.schedule("*/5 * * * *", runCycle, { timezone: "America/Los_Angeles" });
runCycle();

console.log("[LGS Verification] Worker started. Cron: */5 * * * * (every 5 min)");

process.on("SIGINT", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[LGS Verification] Shutting down...");
  process.exit(0);
});

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { disputes, jobs, ledgerEntries, v4FinancialLedger } from "@/db/schema";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { escrows } from "@/db/schema/escrow";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const JOB_EDIT_BLOCKED = new Set([
  "amount_cents",
  "currency",
  "stripe_payment_intent_id",
  "stripe_transfer_id",
  "stripe_charge_id",
  "stripe_captured_at",
  "stripe_paid_at",
  "stripe_refunded_at",
  "contractor_transfer_id",
  "router_transfer_id",
  "payment_status",
  "payout_status",
]);

const VALID_COUNTRY_CODES = ["CA", "US"] as const;
const CA_PROVINCES = new Set(["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const JobPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  scope: z.string().trim().min(1).max(10000).optional(),
  region: z.string().trim().min(1).max(200).optional(),
  trade_category: z.string().trim().optional(),
  city: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(20).optional(),
  address_full: z.string().trim().max(1000).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  region_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .refine((v) => !v || CA_PROVINCES.has(v) || US_STATES.has(v), "Invalid region code"),
  region_name: z.string().trim().max(200).optional(),
  country_code: z
    .string()
    .trim()
    .max(10)
    .optional()
    .refine((v) => !v || VALID_COUNTRY_CODES.includes(v as any), "Invalid country code"),
});

async function canDeleteJob(jobId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [ledgerCount, v4LedgerCount, disputeCount, escrowCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(ledgerEntries).where(eq(ledgerEntries.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(v4FinancialLedger).where(eq(v4FinancialLedger.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(disputes).where(eq(disputes.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(escrows).where(eq(escrows.jobId, jobId)),
  ]);

  if (Number(ledgerCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Ledger entries exist" };
  if (Number(v4LedgerCount[0]?.count ?? 0) > 0) return { ok: false, reason: "v4 financial ledger entries exist" };
  if (Number(disputeCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Disputes exist" };
  if (Number(escrowCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Escrow records exist" };

  const jobRows = await db
    .select({ stripeCapturedAt: jobs.stripe_captured_at })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (jobRows[0]?.stripeCapturedAt != null) {
    return { ok: false, reason: "Stripe funds captured" };
  }

  return { ok: true };
}

const auditAuth = (identity: { userId: string; adminRole: string; authSource: "admin_session" }) => ({
  userId: identity.userId,
  role: "ADMIN" as const,
  authSource: identity.authSource as "admin_session",
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;
    const bodyRaw = await req.json().catch(() => null);
    const body = JobPatchSchema.safeParse(bodyRaw);
    if (!body.success) return err(400, "ADMIN_SUPER_JOB_EDIT_INVALID", "Invalid edit payload");

    const raw = body.data as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined) continue;
      if (JOB_EDIT_BLOCKED.has(k)) {
        return err(400, "ADMIN_SUPER_JOB_EDIT_BLOCKED", `Cannot edit protected field: ${k}`);
      }
      updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return err(400, "ADMIN_SUPER_JOB_EDIT_EMPTY", "No fields to update");

    if (updates.country_code && !VALID_COUNTRY_CODES.includes(updates.country_code as any)) {
      return err(400, "ADMIN_SUPER_JOB_EDIT_INVALID", "Invalid country code");
    }
    if (updates.region_code) {
      const rc = String(updates.region_code).trim().toUpperCase();
      if (!CA_PROVINCES.has(rc) && !US_STATES.has(rc)) {
        return err(400, "ADMIN_SUPER_JOB_EDIT_INVALID", "Invalid region code");
      }
      updates.region = rc.toLowerCase();
      updates.state_code = rc;
    }
    if (updates.country_code) {
      updates.country = updates.country_code;
    }
    if (updates.latitude != null && Number.isFinite(updates.latitude)) {
      updates.lat = updates.latitude;
      delete updates.latitude;
    }
    if (updates.longitude != null && Number.isFinite(updates.longitude)) {
      updates.lng = updates.longitude;
      delete updates.longitude;
    }

    const existing = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!existing[0]) return err(404, "ADMIN_SUPER_JOB_NOT_FOUND", "Job not found");

    const now = new Date();
    const setValues: Record<string, unknown> = { ...updates, updated_at: now };
    const [updated] = await db.update(jobs).set(setValues as any).where(eq(jobs.id, id)).returning({ id: jobs.id });

    await adminAuditLog(req, auditAuth(identity), {
      action: "JOB_EDITED",
      entityType: "Job",
      entityId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return ok({ job: updated });
  } catch (e) {
    console.error("[ADMIN_SUPER_JOB_EDIT_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_JOB_EDIT_FAILED", "Failed to edit job");
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;

    const existing = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        country_code: jobs.country_code,
        state_code: jobs.state_code,
        region_code: jobs.region_code,
        city: jobs.city,
        service_type: jobs.service_type,
        trade_category: jobs.trade_category,
      })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    if (!existing[0]) return err(404, "ADMIN_SUPER_JOB_NOT_FOUND", "Job not found");

    const deleteCheck = await canDeleteJob(id);
    if (!deleteCheck.ok) {
      return err(409, "ADMIN_SUPER_JOB_DELETE_BLOCKED", deleteCheck.reason);
    }

    const deletedAt = new Date();
    const jobRow = existing[0];
    await db.insert(v4EventOutbox).values({
      id: crypto.randomUUID(),
      eventType: "JOB_DELETED",
      payload: {
        jobId: id,
        country_code: jobRow.country_code ?? null,
        state_code: jobRow.state_code ?? null,
        region_code: jobRow.region_code ?? null,
        city: jobRow.city ?? null,
        service_type: jobRow.service_type ?? null,
        trade_category: jobRow.trade_category ?? null,
        dedupeKey: `job_deleted:${id}:${deletedAt.getTime()}`,
      } as Record<string, unknown>,
      createdAt: deletedAt,
    });

    await adminAuditLog(req, auditAuth(identity), {
      action: "JOB_DELETED",
      entityType: "Job",
      entityId: id,
      metadata: {
        deleted_by_admin_id: identity.userId,
        deleted_reason: "hard delete",
        deleted_at: deletedAt.toISOString(),
      },
    });

    await db.delete(jobs).where(eq(jobs.id, id));

    return ok({ deleted: true });
  } catch (e) {
    console.error("[ADMIN_SUPER_JOB_DELETE_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_JOB_DELETE_FAILED", "Failed to delete job");
  }
}

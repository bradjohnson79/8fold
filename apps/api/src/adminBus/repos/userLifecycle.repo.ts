import { and, eq, inArray, or } from "drizzle-orm";
import { contractorAccounts, contractors, jobDispatches, jobPosters, jobs, payoutMethods, routers, users } from "@/db/schema";
import { sessions } from "@/db/schema/session";
import { db } from "@/src/adminBus/db";

const MANAGED_ROLES = new Set(["JOB_POSTER", "CONTRACTOR", "ROUTER"]);
const ACTIVE_JOB_STATUSES = [
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "OPEN_FOR_ROUTING",
  "DISPUTED",
] as const;

type ManagedRole = "JOB_POSTER" | "CONTRACTOR" | "ROUTER";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

type ManagedUser = {
  id: string;
  role: ManagedRole;
  status: string;
  email: string | null;
};

function addMonths(base: Date, months: number): Date {
  const out = new Date(base);
  out.setMonth(out.getMonth() + months);
  return out;
}

async function loadManagedUser(userId: string): Promise<ActionResult<ManagedUser>> {
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) {
    return { ok: false, status: 404, code: "ADMIN_V4_USER_NOT_FOUND", message: "User not found" };
  }

  const role = String(row.role ?? "").toUpperCase();
  if (!MANAGED_ROLES.has(role)) {
    return {
      ok: false,
      status: 400,
      code: "ADMIN_V4_ROLE_NOT_MANAGED",
      message: "Only JOB_POSTER, CONTRACTOR, and ROUTER are managed by this endpoint",
    };
  }

  return {
    ok: true,
    data: {
      id: row.id,
      role: role as ManagedRole,
      status: String(row.status ?? "ACTIVE"),
      email: row.email ?? null,
    },
  };
}

async function hasActiveWork(userId: string): Promise<boolean> {
  const [activeJobRows, activeDispatchRows] = await Promise.all([
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ACTIVE_JOB_STATUSES as any),
          or(
            eq(jobs.job_poster_user_id, userId),
            eq(jobs.contractor_user_id, userId),
            eq(jobs.claimed_by_user_id, userId),
            eq(jobs.admin_routed_by_id, userId),
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: jobDispatches.id })
      .from(jobDispatches)
      .innerJoin(jobs, eq(jobs.id, jobDispatches.jobId))
      .where(and(eq(jobDispatches.routerUserId, userId), inArray(jobs.status, ACTIVE_JOB_STATUSES as any)))
      .limit(1),
  ]);

  return activeJobRows.length > 0 || activeDispatchRows.length > 0;
}

async function hasHistoricalWork(userId: string): Promise<boolean> {
  const [jobRows, dispatchRows] = await Promise.all([
    db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        or(
          eq(jobs.job_poster_user_id, userId),
          eq(jobs.contractor_user_id, userId),
          eq(jobs.claimed_by_user_id, userId),
          eq(jobs.admin_routed_by_id, userId),
        ),
      )
      .limit(1),
    db
      .select({ id: jobDispatches.id })
      .from(jobDispatches)
      .where(eq(jobDispatches.routerUserId, userId))
      .limit(1),
  ]);

  return jobRows.length > 0 || dispatchRows.length > 0;
}

export async function suspendManagedUser(input: {
  userId: string;
  adminId: string;
  months: number;
  reason: string;
}): Promise<ActionResult<{ suspendedUntil: string }>> {
  const user = await loadManagedUser(input.userId);
  if (!user.ok) return user;

  const months = Math.trunc(Number(input.months));
  const reason = String(input.reason ?? "").trim();
  if (!Number.isFinite(months) || months < 1 || months > 6 || !reason) {
    return {
      ok: false,
      status: 400,
      code: "ADMIN_V4_SUSPEND_INVALID",
      message: "months must be between 1 and 6, and reason is required",
    };
  }
  if (user.data.status === "ARCHIVED") {
    return { ok: false, status: 409, code: "ADMIN_V4_USER_ARCHIVED", message: "Archived users cannot be suspended" };
  }

  const now = new Date();
  const suspendedUntil = addMonths(now, months);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        status: "SUSPENDED",
        accountStatus: "SUSPENDED",
        suspendedUntil,
        suspensionReason: reason,
        updatedByAdminId: input.adminId,
        updatedAt: now,
      } as any)
      .where(eq(users.id, input.userId));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  });

  return { ok: true, data: { suspendedUntil: suspendedUntil.toISOString() } };
}

export async function unsuspendManagedUser(input: {
  userId: string;
  adminId: string;
}): Promise<ActionResult<{ restored: true }>> {
  const user = await loadManagedUser(input.userId);
  if (!user.ok) return user;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        status: "ACTIVE",
        accountStatus: "ACTIVE",
        suspendedUntil: null,
        suspensionReason: null,
        updatedByAdminId: input.adminId,
        updatedAt: now,
      } as any)
      .where(eq(users.id, input.userId));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  });

  return { ok: true, data: { restored: true } };
}

export async function archiveManagedUser(input: {
  userId: string;
  adminId: string;
  reason: string;
}): Promise<ActionResult<{ archived: true }>> {
  const user = await loadManagedUser(input.userId);
  if (!user.ok) return user;

  const reason = String(input.reason ?? "").trim();
  if (!reason) {
    return { ok: false, status: 400, code: "ADMIN_V4_ARCHIVE_INVALID", message: "reason is required" };
  }

  if (await hasActiveWork(input.userId)) {
    return { ok: false, status: 409, code: "ADMIN_V4_USER_HAS_ACTIVE_WORK", message: "User has active jobs/routing work" };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        status: "ARCHIVED",
        accountStatus: "ARCHIVED",
        archivedAt: now,
        archivedReason: reason,
        archivedByAdminId: input.adminId,
        suspendedUntil: null,
        suspensionReason: null,
        updatedByAdminId: input.adminId,
        updatedAt: now,
      } as any)
      .where(eq(users.id, input.userId));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  });

  return { ok: true, data: { archived: true } };
}

export async function restoreManagedUser(input: {
  userId: string;
  adminId: string;
}): Promise<ActionResult<{ restored: true }>> {
  const user = await loadManagedUser(input.userId);
  if (!user.ok) return user;

  const now = new Date();
  await db
    .update(users)
    .set({
      status: "ACTIVE",
      accountStatus: "ACTIVE",
      archivedAt: null,
      archivedReason: null,
      suspendedUntil: null,
      suspensionReason: null,
      updatedByAdminId: input.adminId,
      updatedAt: now,
    } as any)
    .where(eq(users.id, input.userId));

  return { ok: true, data: { restored: true } };
}

export async function hardDeleteManagedUser(input: {
  userId: string;
}): Promise<ActionResult<{ deleted: true }>> {
  const user = await loadManagedUser(input.userId);
  if (!user.ok) return user;

  if (await hasHistoricalWork(input.userId)) {
    return {
      ok: false,
      status: 409,
      code: "ADMIN_V4_USER_HAS_HISTORICAL_WORK",
      message: "User has job/routing history and cannot be permanently deleted",
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(payoutMethods).where(eq(payoutMethods.userId, input.userId));
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
    await tx.delete(jobPosters).where(eq(jobPosters.userId, input.userId));
    await tx.delete(routers).where(eq(routers.userId, input.userId));
    await tx.delete(contractorAccounts).where(eq(contractorAccounts.userId, input.userId));
    if (user.data.email) {
      await tx.delete(contractors).where(eq(contractors.email, user.data.email));
    }
    await tx.delete(users).where(eq(users.id, input.userId));
  });

  return { ok: true, data: { deleted: true } };
}

export const userLifecycleRepo = {
  suspendManagedUser,
  unsuspendManagedUser,
  archiveManagedUser,
  restoreManagedUser,
  hardDeleteManagedUser,
};

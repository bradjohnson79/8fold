import { randomUUID } from "crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { contractors } from "@/db/schema/contractor";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobDispatches } from "@/db/schema/jobDispatch";
import { jobs } from "@/db/schema/job";
import { notificationDeliveries } from "@/db/schema/notificationDelivery";
import { users } from "@/db/schema/user";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { haversineKm } from "@/src/jobs/geo";
import { createAdminNotifications, createNotification } from "@/src/services/notifications/notificationService";
import { badRequest, conflict, forbidden } from "./v4Errors";
import { getContractorStripeSnapshot, isContractorStripeVerifiedForJobAcceptance } from "./contractorStripeService";

type InviteDecisionResult = {
  ok: true;
  jobId: string;
  redirectTo: string;
};

function buildScopePreview(scope: string | null | undefined): string {
  const raw = String(scope ?? "").trim();
  if (!raw) return "";
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

async function resolveContractorMirror(tx: any, contractorUserId: string): Promise<{ contractorId: string | null }> {
  const userRows = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, contractorUserId))
    .limit(1);
  const email = String(userRows[0]?.email ?? "").trim().toLowerCase();
  if (!email) return { contractorId: null };

  const contractorRows = await tx
    .select({ contractorId: contractors.id })
    .from(contractors)
    .where(sql<boolean>`lower(${contractors.email}) = ${email}`)
    .limit(1);
  return { contractorId: contractorRows[0]?.contractorId ?? null };
}

async function insertNotificationBothStoresTx(
  tx: any,
  args: {
    userId: string;
    role: "CONTRACTOR" | "ROUTER" | "JOB_POSTER";
    type: string;
    title: string;
    message: string;
    entityId: string;
    jobId: string;
    priority?: "LOW" | "NORMAL" | "HIGH";
    createdAt: Date;
  },
) {
  await createNotification(
    {
      userId: args.userId,
      role: args.role,
      type: args.type,
      title: args.title,
      message: args.message,
      entityType: "JOB",
      entityId: args.entityId,
      priority: args.priority ?? "NORMAL",
      createdAt: args.createdAt,
      metadata: { jobId: args.jobId },
      idempotencyKey: `${String(args.type).toUpperCase()}:${args.userId}:${args.jobId}:${args.createdAt.toISOString()}`,
    },
    tx,
  );

  await tx.insert(notificationDeliveries).values({
    id: randomUUID(),
    userId: args.userId,
    title: args.title,
    body: args.message,
    createdAt: args.createdAt,
    createdByAdminUserId: null,
    jobId: args.jobId,
  });
}

export async function listInvites(contractorUserId: string) {
  const rows = await db
    .select({
      id: v4ContractorJobInvites.id,
      jobId: v4ContractorJobInvites.jobId,
      routeId: v4ContractorJobInvites.routeId,
      status: v4ContractorJobInvites.status,
      createdAt: v4ContractorJobInvites.createdAt,
      title: jobs.title,
      scope: jobs.scope,
      region: jobs.region,
      city: jobs.city,
      budgetCents: jobs.amount_cents,
      jobType: jobs.job_type,
      postedAt: jobs.posted_at,
      publishedAt: jobs.published_at,
      createdJobAt: jobs.created_at,
      routedAt: jobs.routed_at,
      jobLat: jobs.lat,
      jobLng: jobs.lng,
      routerName: users.name,
      routerEmail: users.email,
      contractorLat: contractorProfilesV4.homeLatitude,
      contractorLng: contractorProfilesV4.homeLongitude,
    })
    .from(v4ContractorJobInvites)
    .innerJoin(jobs, eq(jobs.id, v4ContractorJobInvites.jobId))
    .leftJoin(users, eq(users.id, v4ContractorJobInvites.routeId))
    .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, v4ContractorJobInvites.contractorUserId))
    .where(and(eq(v4ContractorJobInvites.contractorUserId, contractorUserId), eq(v4ContractorJobInvites.status, "PENDING")))
    .orderBy(desc(v4ContractorJobInvites.createdAt));

  const invites = rows.map((row) => {
    const distanceKm =
      typeof row.jobLat === "number" &&
      typeof row.jobLng === "number" &&
      typeof row.contractorLat === "number" &&
      typeof row.contractorLng === "number"
        ? Number(haversineKm({ lat: row.contractorLat, lng: row.contractorLng }, { lat: row.jobLat, lng: row.jobLng }).toFixed(1))
        : null;
    const postedAt = row.postedAt ?? row.publishedAt ?? row.createdJobAt ?? row.createdAt;
    const routerName = String(row.routerName ?? "").trim() || String(row.routerEmail ?? "").trim() || "Router";
    return {
      id: row.id,
      jobId: row.jobId,
      routeId: row.routeId,
      status: row.status,
      createdAt: row.createdAt,
      title: row.title,
      scope: row.scope,
      region: row.region,
      jobTitle: row.title,
      city: row.city,
      budgetCents: Number(row.budgetCents ?? 0),
      jobType: row.jobType,
      postedAt,
      routedAt: row.routedAt ?? row.createdAt,
      scopePreview: buildScopePreview(row.scope),
      distanceKm,
      routerName,
    };
  });

  const paymentReady = await getContractorStripeSnapshot(contractorUserId);
  return { invites, paymentReady };
}

export async function getInviteByJob(contractorUserId: string, jobId: string) {
  const rows = await db
    .select()
    .from(v4ContractorJobInvites)
    .where(and(eq(v4ContractorJobInvites.contractorUserId, contractorUserId), eq(v4ContractorJobInvites.jobId, jobId)))
    .orderBy(desc(v4ContractorJobInvites.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function getPendingInviteByJob(contractorUserId: string, jobId: string) {
  const rows = await db
    .select()
    .from(v4ContractorJobInvites)
    .where(
      and(
        eq(v4ContractorJobInvites.contractorUserId, contractorUserId),
        eq(v4ContractorJobInvites.jobId, jobId),
        eq(v4ContractorJobInvites.status, "PENDING"),
      ),
    )
    .orderBy(desc(v4ContractorJobInvites.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function acceptInvite(contractorUserId: string, jobId: string): Promise<InviteDecisionResult> {
  const invite = await getPendingInviteByJob(contractorUserId, jobId);
  if (!invite) {
    const existing = await getInviteByJob(contractorUserId, jobId);
    if (!existing) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
    throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already accepted or rejected");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const paymentReady = await isContractorStripeVerifiedForJobAcceptance(contractorUserId);
    if (!paymentReady) {
      await insertNotificationBothStoresTx(tx, {
        userId: contractorUserId,
        role: "CONTRACTOR",
        type: "PAYMENT_SETUP_REQUIRED",
        title: "Payment setup required",
        message: "You must complete Payment Setup before accepting jobs.",
        entityId: jobId,
        jobId,
        priority: "HIGH",
        createdAt: now,
      });
      throw forbidden("V4_PAYMENT_SETUP_REQUIRED", "You must complete Payment Setup before accepting jobs.");
    }

    await tx.execute(sql`select ${jobs.id} from ${jobs} where ${jobs.id} = ${jobId} for update`);

    const jobRows = await tx
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        contractorUserId: jobs.contractor_user_id,
        routingStatus: jobs.routing_status,
        jobPosterUserId: jobs.job_poster_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job || !job.jobPosterUserId) throw badRequest("V4_JOB_NOT_FOUND", "Job not found");

    if (job.contractorUserId && job.contractorUserId !== contractorUserId) {
      throw conflict("V4_JOB_ALREADY_ASSIGNED", "This job has already been assigned.");
    }
    if (job.status !== "OPEN_FOR_ROUTING" && job.contractorUserId !== contractorUserId) {
      throw conflict("V4_JOB_ALREADY_ASSIGNED", "This job has already been assigned.");
    }

    const assignmentRows = await tx
      .select({
        id: v4JobAssignments.id,
        contractorUserId: v4JobAssignments.contractorUserId,
      })
      .from(v4JobAssignments)
      .where(eq(v4JobAssignments.jobId, jobId))
      .limit(1);
    const existingAssignment = assignmentRows[0] ?? null;
    if (existingAssignment && existingAssignment.contractorUserId !== contractorUserId) {
      throw conflict("V4_JOB_ALREADY_ASSIGNED", "This job has already been assigned.");
    }

    const updated = await tx
      .update(jobs)
      .set({
        status: "ASSIGNED" as any,
        contractor_user_id: contractorUserId,
        accepted_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, "OPEN_FOR_ROUTING"),
          sql`${jobs.contractor_user_id} is null`,
        ),
      )
      .returning({ id: jobs.id });
    if (updated.length !== 1) {
      const refreshed = await tx
        .select({ contractorUserId: jobs.contractor_user_id, status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      if (refreshed[0]?.contractorUserId && refreshed[0]?.contractorUserId !== contractorUserId) {
        throw conflict("V4_JOB_ALREADY_ASSIGNED", "This job has already been assigned.");
      }
      throw conflict("V4_JOB_NOT_AVAILABLE", "Job is no longer available.");
    }

    const otherInvites = await tx
      .select({
        id: v4ContractorJobInvites.id,
        contractorUserId: v4ContractorJobInvites.contractorUserId,
      })
      .from(v4ContractorJobInvites)
      .where(
        and(
          eq(v4ContractorJobInvites.jobId, jobId),
          eq(v4ContractorJobInvites.status, "PENDING"),
          ne(v4ContractorJobInvites.id, invite.id),
        ),
      );

    await tx.update(v4ContractorJobInvites).set({ status: "ACCEPTED" }).where(eq(v4ContractorJobInvites.id, invite.id));

    if (otherInvites.length > 0) {
      await tx
        .update(v4ContractorJobInvites)
        .set({ status: "AUTO_DECLINED" })
        .where(
          and(
            eq(v4ContractorJobInvites.jobId, jobId),
            eq(v4ContractorJobInvites.status, "PENDING"),
            ne(v4ContractorJobInvites.id, invite.id),
          ),
        );
    }

    if (existingAssignment) {
      await tx.update(v4JobAssignments).set({ status: "ASSIGNED" }).where(eq(v4JobAssignments.id, existingAssignment.id));
    } else {
      await tx.insert(v4JobAssignments).values({
        id: randomUUID(),
        jobId,
        contractorUserId,
        status: "ASSIGNED",
        assignedAt: now,
      });
    }

    await tx
      .update(jobDispatches)
      .set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any)
      .where(and(eq(jobDispatches.jobId, jobId), eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} <= now()`));

    const mirror = await resolveContractorMirror(tx, contractorUserId);
    if (mirror.contractorId) {
      await tx
        .update(jobDispatches)
        .set({ status: "ACCEPTED", respondedAt: now, updatedAt: now } as any)
        .where(
          and(
            eq(jobDispatches.jobId, jobId),
            eq(jobDispatches.contractorId, mirror.contractorId),
            eq(jobDispatches.status, "PENDING"),
          ),
        );

      await tx
        .update(jobDispatches)
        .set({ status: "DECLINED", respondedAt: now, updatedAt: now } as any)
        .where(
          and(
            eq(jobDispatches.jobId, jobId),
            eq(jobDispatches.status, "PENDING"),
            ne(jobDispatches.contractorId, mirror.contractorId),
          ),
        );
    } else {
      await tx
        .update(jobDispatches)
        .set({ status: "DECLINED", respondedAt: now, updatedAt: now } as any)
        .where(and(eq(jobDispatches.jobId, jobId), eq(jobDispatches.status, "PENDING")));
    }

    const existingThread = await tx
      .select({ id: v4MessageThreads.id })
      .from(v4MessageThreads)
      .where(
        and(
          eq(v4MessageThreads.jobId, jobId),
          eq(v4MessageThreads.jobPosterUserId, job.jobPosterUserId),
          eq(v4MessageThreads.contractorUserId, contractorUserId),
        ),
      )
      .limit(1);
    if (existingThread.length === 0) {
      await tx.insert(v4MessageThreads).values({
        id: randomUUID(),
        jobId,
        jobPosterUserId: job.jobPosterUserId,
        contractorUserId,
      });
    }

    await insertNotificationBothStoresTx(tx, {
      userId: invite.routeId,
      role: "ROUTER",
      type: "JOB_ASSIGNED",
      title: "Contractor Assigned",
      message: "A contractor accepted a routed job invite.",
      entityId: jobId,
      jobId,
      priority: "NORMAL",
      createdAt: now,
    });
    await insertNotificationBothStoresTx(tx, {
      userId: job.jobPosterUserId,
      role: "JOB_POSTER",
      type: "JOB_ASSIGNED",
      title: "Contractor Assigned",
      message: "A contractor has accepted your job and is now assigned.",
      entityId: jobId,
      jobId,
      priority: "NORMAL",
      createdAt: now,
    });
    await insertNotificationBothStoresTx(tx, {
      userId: contractorUserId,
      role: "CONTRACTOR",
      type: "JOB_ASSIGNED",
      title: "You are assigned",
      message: "You accepted this invite and are now assigned to the job.",
      entityId: jobId,
      jobId,
      priority: "NORMAL",
      createdAt: now,
    });

    for (const other of otherInvites) {
      await insertNotificationBothStoresTx(tx, {
        userId: other.contractorUserId,
        role: "CONTRACTOR",
        type: "JOB_ASSIGNED",
        title: "Invite Closed",
        message: "This routed invite has been closed because another contractor accepted.",
        entityId: jobId,
        jobId,
        priority: "LOW",
        createdAt: now,
      });
    }
    await createAdminNotifications(
      {
        type: "JOB_ASSIGNED",
        title: "Contractor Assigned",
        message: `Job ${jobId} was accepted by a contractor and moved to ASSIGNED.`,
        entityType: "JOB",
        entityId: jobId,
        priority: "NORMAL",
        metadata: {
          jobId,
          routerUserId: invite.routeId,
          contractorUserId,
          jobPosterUserId: job.jobPosterUserId,
        },
        idempotencyKey: `job_assigned:${jobId}`,
        createdAt: now,
      },
      tx,
    );

    await tx.insert(auditLogs).values({
      id: randomUUID(),
      createdAt: now,
      actorUserId: contractorUserId,
      action: "V4_CONTRACTOR_INVITE_ACCEPTED",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        inviteId: invite.id,
        routeId: invite.routeId,
        autoDeclinedInviteIds: otherInvites.map((row) => row.id),
      } as any,
    });

    return {
      ok: true,
      jobId,
      redirectTo: `/dashboard/contractor/jobs/${jobId}`,
    };
  });
}

export async function rejectInvite(contractorUserId: string, jobId: string): Promise<InviteDecisionResult> {
  const invite = await getPendingInviteByJob(contractorUserId, jobId);
  if (!invite) {
    const existing = await getInviteByJob(contractorUserId, jobId);
    if (!existing) throw badRequest("V4_INVITE_NOT_FOUND", "Invite not found");
    throw conflict("V4_INVITE_ALREADY_RESPONDED", "Invite already accepted or rejected");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(v4ContractorJobInvites).set({ status: "DECLINED" }).where(eq(v4ContractorJobInvites.id, invite.id));

    await tx
      .update(jobDispatches)
      .set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any)
      .where(and(eq(jobDispatches.jobId, jobId), eq(jobDispatches.status, "PENDING"), sql`${jobDispatches.expiresAt} <= now()`));

    const mirror = await resolveContractorMirror(tx, contractorUserId);
    if (mirror.contractorId) {
      await tx
        .update(jobDispatches)
        .set({ status: "DECLINED", respondedAt: now, updatedAt: now } as any)
        .where(
          and(
            eq(jobDispatches.jobId, jobId),
            eq(jobDispatches.contractorId, mirror.contractorId),
            eq(jobDispatches.status, "PENDING"),
          ),
        );
    }

    await insertNotificationBothStoresTx(tx, {
      userId: invite.routeId,
      role: "ROUTER",
      type: "JOB_DECLINED",
      title: "Job Invite Declined",
      message: "A contractor declined a routed invite.",
      entityId: jobId,
      jobId,
      priority: "NORMAL",
      createdAt: now,
    });

    await tx.insert(auditLogs).values({
      id: randomUUID(),
      createdAt: now,
      actorUserId: contractorUserId,
      action: "V4_CONTRACTOR_INVITE_DECLINED",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        inviteId: invite.id,
        routeId: invite.routeId,
      } as any,
    });

    const pendingOrAcceptedDispatchRows = await tx
      .select({ id: jobDispatches.id })
      .from(jobDispatches)
      .where(
        and(
          eq(jobDispatches.jobId, jobId),
          sql`(${jobDispatches.status} = 'ACCEPTED' or (${jobDispatches.status} = 'PENDING' and ${jobDispatches.expiresAt} > now()))`,
        ),
      )
      .limit(1);

    if (pendingOrAcceptedDispatchRows.length === 0) {
      await tx
        .update(jobs)
        .set({
          routing_status: "UNROUTED" as any,
          claimed_by_user_id: null,
          claimed_at: null,
          routed_at: null,
          updated_at: now,
        })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, "OPEN_FOR_ROUTING")));
    }

    return {
      ok: true,
      jobId,
      redirectTo: "/dashboard/contractor/invites",
    };
  });
}

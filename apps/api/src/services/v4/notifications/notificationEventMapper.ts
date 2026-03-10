import { eq, isNull, sql } from "drizzle-orm";
import { admins } from "@/db/schema/admin";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { db } from "@/db/drizzle";
import type {
  DomainEvent,
  DomainEventDispatchMode,
  DomainEventType,
  NotificationEntityType,
} from "@/src/events/domainEventTypes";
import { MAPPED_DOMAIN_EVENT_TYPES } from "@/src/events/domainEventRegistry";
import { sendNotification } from "./notificationService";

async function safeSeoIndexAndSitemap(jobId: string, triggeredBy: string): Promise<void> {
  // SEO indexing requires Node runtime — skip silently in Edge context
  if (process.env.NEXT_RUNTIME === "edge") return;

  try {
    const { resolveJobUrl } = await import("@/src/services/v4/seo/canonicalUrlService");
    const { pingUrl } = await import("@/src/services/v4/seo/indexingService");
    const { invalidateSitemapCache } = await import("@/src/services/v4/seo/sitemapService");

    const jobUrl = await resolveJobUrl(jobId);
    await Promise.allSettled([
      pingUrl(jobUrl, triggeredBy),
      invalidateSitemapCache("jobs"),
    ]);
  } catch (err) {
    console.error("[SEO_AUTO_INDEX_ERROR]", {
      jobId,
      triggeredBy,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export function getMappedDomainEventTypes(): DomainEventType[] {
  return [...MAPPED_DOMAIN_EVENT_TYPES];
}

async function safeNotify(
  eventType: DomainEventType,
  payload: Record<string, unknown>,
  input: Parameters<typeof sendNotification>[0],
  tx?: any,
): Promise<void> {
  try {
    if (tx) {
      await tx.execute(sql`SAVEPOINT notify_sp`);
      try {
        await sendNotification(input, tx);
      } catch (err) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT notify_sp`);
        console.error("[notification-insert-error]", {
          eventType,
          userId: input.userId,
          type: input.type,
          dedupeKey: input.idempotencyKey ?? input.dedupeKey ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      await sendNotification(input);
    }
  } catch (err) {
    console.error("[notification-error]", {
      eventType,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function getActiveAdminIds(tx?: any): Promise<string[]> {
  try {
    const exec = tx ?? db;
    const rows = await exec.select({ id: admins.id }).from(admins).where(isNull(admins.disabledAt));
    return rows.map((row: { id: string }) => String(row.id));
  } catch (error) {
    console.error("[NOTIFICATION_EVENT_MAPPER_ERROR]", {
      eventType: "ADMIN_RECIPIENT_LOOKUP",
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function asDate(input: Date | undefined): Date {
  return input instanceof Date ? input : new Date();
}

function asEntity(entityType: NotificationEntityType): NotificationEntityType {
  return entityType;
}

export async function notificationEventMapper(
  event: DomainEvent,
  options?: { tx?: any; mode?: DomainEventDispatchMode },
): Promise<void> {
  const tx = options?.tx;
  const mode = options?.mode ?? "within_tx";

  const run = async () => {
    switch (event.type) {
      case "ROUTER_JOB_ROUTED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "NEW_JOB_INVITE",
            title: "New Routed Job Available",
            message: "You have been selected for a new job.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );
        return;
      }

      case "CONTRACTOR_INVITE_EXPIRED": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "INVITE_EXPIRED",
              title: "Invite expired",
              message: "A routed job invite expired before response.",
              entityType: asEntity("INVITE"),
              entityId: p.inviteId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: p.dedupeKey,
              idempotencyKey: p.dedupeKey,
              metadata: { jobId: p.jobId, inviteId: p.inviteId },
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "ROUTING_WINDOW_EXPIRED",
              title: "Routing window expired",
              message: "A routed job returned to the queue because no contractor accepted in time.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKey}:router`,
              idempotencyKey: `${p.dedupeKey}:router`,
            },
            tx,
          );
        }
        return;
      }

      case "CONTRACTOR_ACCEPTED_INVITE": {
        const p = event.payload;
        console.log("[invite-accept-step] CONTRACTOR_ACCEPTED_INVITE mapper entered", {
          jobId: p?.jobId,
        });

        let jobTitle = "a job";
        let contractorName = "A contractor";
        try {
          const [jobRow] = await (tx ?? db)
            .select({ title: jobs.title })
            .from(jobs)
            .where(eq(jobs.id, String(p.jobId)))
            .limit(1);
          const [cpRow] = await (tx ?? db)
            .select({
              contactName: contractorProfilesV4.contactName,
              businessName: contractorProfilesV4.businessName,
            })
            .from(contractorProfilesV4)
            .where(eq(contractorProfilesV4.userId, String(p.contractorId)))
            .limit(1);
          if (jobRow?.title) jobTitle = jobRow.title;
          if (cpRow?.contactName) contractorName = cpRow.contactName;
          else if (cpRow?.businessName) contractorName = cpRow.businessName;
        } catch {
          /* fallback to defaults */
        }

        const enrichedMeta = {
          jobId: p.jobId,
          contractorUserId: p.contractorId,
          jobTitle: jobTitle ?? "a job",
          contractorName: contractorName ?? "A contractor",
        };
        console.log("[invite-accept-step] CONTRACTOR_ACCEPTED_INVITE before safeNotify contractor");

        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "JOB_ASSIGNED",
            title: "Job assigned",
            message: `You accepted the invite and are now assigned to: ${jobTitle}`,
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            metadata: enrichedMeta,
            createdAt: asDate(p.createdAt),
            dedupeKey: `${p.dedupeKeyBase}:contractor`,
            idempotencyKey: `${p.dedupeKeyBase}:contractor`,
          },
          tx,
        );
        console.log("[invite-accept-step] CONTRACTOR_ACCEPTED_INVITE after safeNotify contractor");
        await safeNotify(
          event.type,
          p,
          {
            userId: p.jobPosterId,
            role: "JOB_POSTER",
            type: "CONTRACTOR_ACCEPTED",
            title: "Contractor accepted",
            message: `${contractorName} has accepted your job: ${jobTitle}`,
            entityType: asEntity("INVITE"),
            entityId: p.inviteId,
            priority: "NORMAL",
            metadata: enrichedMeta,
            createdAt: asDate(p.createdAt),
            dedupeKey: `${p.dedupeKeyBase}:poster`,
            idempotencyKey: `${p.dedupeKeyBase}:poster`,
          },
          tx,
        );
        console.log("[invite-accept-step] CONTRACTOR_ACCEPTED_INVITE after safeNotify poster");
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "CONTRACTOR_ACCEPTED",
              title: "Routing success",
              message: `${jobTitle} has been accepted by ${contractorName}`,
              entityType: asEntity("INVITE"),
              entityId: p.inviteId,
              priority: "NORMAL",
              metadata: enrichedMeta,
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        console.log("[invite-accept-step] CONTRACTOR_ACCEPTED_INVITE mapper done");
        return;
      }

      case "CONTRACTOR_REJECTED_INVITE": {
        const p = event.payload;
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "JOB_REJECTED",
              title: "Invite rejected",
              message: "A contractor rejected a routed invite.",
              entityType: asEntity("INVITE"),
              entityId: p.inviteId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "JOB_REJECTED",
              title: "Invite declined",
              message: "A contractor declined this job invite.",
              entityType: asEntity("INVITE"),
              entityId: p.inviteId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        return;
      }

      case "POSTER_ACCEPTED_CONTRACTOR": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "POSTER_ACCEPTED",
            title: "Assigned contractor accepted",
            message: "The job poster accepted your assignment.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );
        return;
      }

      case "APPOINTMENT_BOOKED": {
        const p = event.payload;
        const exec = tx ?? db;
        const [jobRow] = await exec
          .select({ title: jobs.title })
          .from(jobs)
          .where(eq(jobs.id, p.jobId))
          .limit(1);
        const jobTitle = jobRow?.title ?? "a job";
        await safeNotify(
          event.type,
          p,
          {
            userId: p.jobPosterId,
            role: "JOB_POSTER",
            type: "APPOINTMENT_BOOKED",
            title: "Appointment Scheduled",
            message: `A contractor scheduled an appointment for your job: ${jobTitle}`,
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { jobId: p.jobId, jobTitle },
          },
          tx,
        );
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "APPOINTMENT_BOOKED",
              title: "Appointment Scheduled",
              message: `A contractor scheduled an appointment for a job you routed: ${jobTitle}`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKey}:router`,
              idempotencyKey: `${p.dedupeKey}:router`,
              metadata: { jobId: p.jobId, jobTitle },
            },
            tx,
          );
        }
        return;
      }

      case "APPOINTMENT_ACCEPTED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "RESCHEDULE_ACCEPTED",
            title: "Appointment accepted",
            message: "The job poster accepted your appointment.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );
        return;
      }

      case "RESCHEDULE_REQUESTED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.jobPosterId,
            role: "JOB_POSTER",
            type: "RESCHEDULE_REQUEST",
            title: "Appointment reschedule requested",
            message: "Your contractor proposed a new appointment time.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { appointmentAt: p.appointmentAt },
          },
          tx,
        );
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "RESCHEDULE_REQUEST",
              title: "Appointment reschedule requested",
              message: "A contractor on your routed job proposed a new appointment time.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKey}:router`,
              idempotencyKey: `${p.dedupeKey}:router`,
              metadata: { appointmentAt: p.appointmentAt },
            },
            tx,
          );
        }
        return;
      }

      case "JOB_PUBLISHED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.jobPosterId,
            role: "JOB_POSTER",
            type: "JOB_PUBLISHED",
            title: "Job published",
            message: "Your job is now published.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "LOW",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );

        // SEO automation: ping search engines and invalidate sitemap cache (best-effort, non-blocking)
        if (mode === "best_effort") {
          void safeSeoIndexAndSitemap(p.jobId, event.type);
        }

        return;
      }

      case "CUSTOMER_CANCELLED": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "JOB_CANCELLED_BY_CUSTOMER",
              title: "Job cancelled",
              message: "The customer cancelled this job.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:contractor`,
              idempotencyKey: `${p.dedupeKeyBase}:contractor`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "JOB_CANCELLED_BY_CUSTOMER",
              title: "Job cancelled",
              message: "A customer cancelled a routed job.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        return;
      }

      case "CONTRACTOR_CANCELLED": {
        const p = event.payload;
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "CONTRACTOR_CANCELLED",
              title: "Contractor cancelled assignment",
              message: p.message,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "CONTRACTOR_CANCELLED",
              title: "Contractor cancelled assignment",
              message: "The job returned to routing.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        return;
      }

      case "BREACH_APPLIED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "BREACH_PENALTY_APPLIED",
            title: "Breach penalty applied",
            message: "A breach penalty has been applied to your account.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "HIGH",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );
        return;
      }

      case "SUSPENSION_APPLIED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "SUSPENSION_APPLIED",
            title: "Suspension applied",
            message: "Your account has been suspended.",
            entityType: asEntity("SYSTEM"),
            entityId: p.contractorId,
            priority: "HIGH",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
          },
          tx,
        );
        return;
      }

      case "PAYMENT_CAPTURED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.jobPosterId,
            role: "JOB_POSTER",
            type: "PAYMENT_RECEIVED",
            title: "Payment received",
            message: "Your payment is secured and your job is ready for routing.",
            entityType: asEntity("PAYMENT"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: `${p.dedupeKeyBase}:poster`,
            idempotencyKey: `${p.dedupeKeyBase}:poster`,
            metadata: p.metadata ?? {},
          },
          tx,
        );
        const adminIds = p.adminIds?.length ? p.adminIds : await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "PAYMENT_RECEIVED",
              title: "Payment received",
              message: `Job ${p.jobId} payment is now secured.`,
              entityType: asEntity("PAYMENT"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              metadata: p.metadata ?? {},
            },
            tx,
          );
        }
        return;
      }

      case "REFUND_ISSUED": {
        const p = event.payload;
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "JOB_REFUNDED",
              title: "Job refunded",
              message: "A refund has been issued for your job payment.",
              entityType: asEntity("PAYMENT"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
              metadata: p.metadata ?? {},
            },
            tx,
          );
        }
        const adminIds = p.adminIds?.length ? p.adminIds : await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "JOB_REFUNDED",
              title: "Job refunded",
              message: `Refund issued for job ${p.jobId}.`,
              entityType: asEntity("PAYMENT"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              metadata: p.metadata ?? {},
            },
            tx,
          );
        }
        return;
      }

      case "FUNDS_RELEASED": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "FUNDS_RELEASED",
              title: "Funds released",
              message: "Your payout transfer has been released.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:contractor`,
              idempotencyKey: `${p.dedupeKeyBase}:contractor`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "FUNDS_RELEASED",
              title: "Funds released",
              message: "Job payout has been released.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "FUNDS_RELEASED",
              title: "Funds released",
              message: "Payout transfers for your job were released successfully.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        return;
      }

      case "FUNDS_RELEASE_ELIGIBLE": {
        const p = event.payload;
        const adminIds = await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "SYSTEM_ALERT",
              title: "Funds release eligible",
              message: `Job ${p.jobId} is now eligible for release review.`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKeyBase}:admin:${adminId}`,
            },
            tx,
          );
        }
        return;
      }

      case "CONTRACTOR_COMPLETED": {
        const p = event.payload;
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "CONTRACTOR_COMPLETED_JOB",
              title: "Contractor marked job completed",
              message: "Review completion details and confirm if work is complete.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "CONTRACTOR_COMPLETED_JOB",
              title: "Contractor completed assigned job",
              message: "Job completion is pending job poster confirmation.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        return;
      }

      case "JOB_STARTED": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "JOB_STARTED",
              title: "Job started",
              message: "The appointment window is open. You can now mark this job complete once work is done.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:contractor`,
              idempotencyKey: `${p.dedupeKeyBase}:contractor`,
            },
            tx,
          );
        }
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "JOB_STARTED",
              title: "Job started",
              message: "Your scheduled job has started.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        return;
      }

      case "CONTRACTOR_MARKED_COMPLETE": {
        const p = event.payload;
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "CONTRACTOR_COMPLETED_JOB",
              title: "Contractor marked complete",
              message: "The contractor marked this job complete. Review and confirm to finalize.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:poster`,
              idempotencyKey: `${p.dedupeKeyBase}:poster`,
            },
            tx,
          );
        }
        return;
      }

      case "POSTER_MARKED_COMPLETE": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "POSTER_ACCEPTED",
              title: "Job poster confirmed completion",
              message: "The job poster confirmed completion on this job.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:contractor`,
              idempotencyKey: `${p.dedupeKeyBase}:contractor`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "POSTER_ACCEPTED",
              title: "Job poster confirmed completion",
              message: "The job poster confirmed completion on a job you routed.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        return;
      }

      case "COMPLETED": {
        // Lifecycle event only; notifications sent by JOB_COMPLETED_FINALIZED.
        return;
      }

      case "JOB_COMPLETED_FINALIZED": {
        const p = event.payload;
        if (p.contractorId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "CONTRACTOR_COMPLETED_JOB",
              title: "Job completion finalized",
              message: "Both parties marked this job complete.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:contractor`,
              idempotencyKey: `${p.dedupeKeyBase}:contractor`,
            },
            tx,
          );
        }
        if (p.routerId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.routerId),
              role: "ROUTER",
              type: "CONTRACTOR_COMPLETED_JOB",
              title: "Job completion finalized",
              message: "A routed job has reached dual-confirm completion.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:router`,
              idempotencyKey: `${p.dedupeKeyBase}:router`,
            },
            tx,
          );
        }
        const adminIds = await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "SYSTEM_ALERT",
              title: "Job completion finalized",
              message: `Job ${p.jobId} reached dual-confirm completion.`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "LOW",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKeyBase}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKeyBase}:admin:${adminId}`,
            },
            tx,
          );
        }
        return;
      }

      case "NEW_MESSAGE": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.recipientUserId,
            role: p.recipientRole,
            type: "NEW_MESSAGE",
            title: "New message",
            message: "You received a new message on a job thread.",
            entityType: asEntity("THREAD"),
            entityId: p.threadId,
            priority: "LOW",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { threadId: p.threadId, messageId: p.messageId, jobId: p.jobId },
          },
          tx,
        );
        return;
      }

      case "NEW_SUPPORT_TICKET": {
        const p = event.payload;
        // Notify all active admins
        const adminIds = p.adminIds ?? await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: adminId,
              role: "ADMIN",
              type: "NEW_SUPPORT_TICKET",
              title: "New support ticket",
              message: `New support ticket from ${p.role}: "${p.subject}"`,
              entityType: asEntity("SUPPORT_TICKET"),
              entityId: p.ticketId,
              priority: "NORMAL",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKey}_admin_${adminId}`,
              idempotencyKey: `${p.dedupeKey}_admin_${adminId}`,
              metadata: { ticketId: p.ticketId, userId: p.userId, role: p.role },
            },
            tx,
          );
        }
        return;
      }

      case "SUPPORT_REPLY": {
        const p = event.payload;
        const userRole = (p.userRole ?? "CONTRACTOR") as "CONTRACTOR" | "JOB_POSTER" | "ROUTER" | "ADMIN";
        await safeNotify(
          event.type,
          p,
          {
            userId: p.userId,
            role: userRole,
            type: "SUPPORT_REPLY",
            title: "Support reply",
            message: `Admin replied to your support ticket: "${p.subject}"`,
            entityType: asEntity("SUPPORT_TICKET"),
            entityId: p.ticketId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { ticketId: p.ticketId },
          },
          tx,
        );
        return;
      }

      case "RE_APPRAISAL_REQUESTED": {
        const p = event.payload;
        const adminIds = await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: adminId,
              role: "ADMIN",
              type: "RE_APPRAISAL_REQUESTED",
              title: "2nd Appraisal Request",
              message: `Contractor submitted a re-appraisal request for job ${p.jobId.slice(0, 8)}…`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: new Date(),
              dedupeKey: `${p.dedupeKey}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKey}:admin:${adminId}`,
              metadata: { adjustmentId: p.adjustmentId, jobId: p.jobId },
            },
            tx,
          );
        }
        return;
      }

      case "RE_APPRAISAL_DECLINED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "RE_APPRAISAL_DECLINED",
            title: "Re-Appraisal Declined",
            message: "The Job Poster declined your re-appraisal request.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: new Date(),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { adjustmentId: p.adjustmentId, jobId: p.jobId },
          },
          tx,
        );
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "RE_APPRAISAL_DECLINED",
              title: "Re-Appraisal Declined",
              message: "You declined the re-appraisal request. The job will continue at the original price.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: new Date(),
              dedupeKey: `${p.dedupeKey}:poster`,
              idempotencyKey: `${p.dedupeKey}:poster`,
              metadata: { adjustmentId: p.adjustmentId, jobId: p.jobId },
            },
            tx,
          );
        }
        return;
      }

      case "RE_APPRAISAL_ACCEPTED": {
        const p = event.payload;
        await safeNotify(
          event.type,
          p,
          {
            userId: p.contractorId,
            role: "CONTRACTOR",
            type: "RE_APPRAISAL_ACCEPTED",
            title: "Re-Appraisal Accepted",
            message: "The Job Poster accepted your re-appraisal request and payment is complete.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: new Date(),
            dedupeKey: p.dedupeKey,
            idempotencyKey: p.dedupeKey,
            metadata: { adjustmentId: p.adjustmentId, jobId: p.jobId },
          },
          tx,
        );
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "RE_APPRAISAL_ACCEPTED",
              title: "Re-Appraisal Payment Complete",
              message: "Your additional payment has been processed. The job price has been updated.",
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: new Date(),
              dedupeKey: `${p.dedupeKey}:poster`,
              idempotencyKey: `${p.dedupeKey}:poster`,
              metadata: { adjustmentId: p.adjustmentId, jobId: p.jobId },
            },
            tx,
          );
        }
        return;
      }

      case "JOB_CANCELLATION_REQUESTED": {
        const p = event.payload;
        // Notify all admins that a cancellation request has been submitted
        const adminIds = p.adminIds?.length ? p.adminIds : await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "JOB_CANCELLATION_REQUESTED",
              title: "Job Cancellation Request",
              message: `A Job Poster has requested to cancel job ${p.jobId}. Reason: ${p.reason}`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: asDate(p.createdAt),
              dedupeKey: `${p.dedupeKey}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKey}:admin:${adminId}`,
              metadata: { jobId: p.jobId, cancelRequestId: p.cancelRequestId, reason: p.reason },
            },
            tx,
          );
        }
        // Confirm receipt to job poster
        await safeNotify(
          event.type,
          p,
          {
            userId: String(p.jobPosterId),
            role: "JOB_POSTER",
            type: "JOB_CANCELLATION_REQUESTED",
            title: "Cancellation Request Submitted",
            message: "Your cancellation request has been submitted and is under review by our team.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "NORMAL",
            createdAt: asDate(p.createdAt),
            dedupeKey: `${p.dedupeKey}:poster`,
            idempotencyKey: `${p.dedupeKey}:poster`,
            metadata: { jobId: p.jobId, cancelRequestId: p.cancelRequestId },
          },
          tx,
        );
        return;
      }

      case "JOB_CANCELLATION_APPROVED": {
        const p = event.payload;
        // Notify job poster that their cancellation has been approved
        await safeNotify(
          event.type,
          p,
          {
            userId: String(p.jobPosterId),
            role: "JOB_POSTER",
            type: "JOB_CANCELLATION_APPROVED",
            title: "Job Cancellation Approved",
            message: "Your cancellation request has been approved. Your job has been cancelled.",
            entityType: asEntity("JOB"),
            entityId: p.jobId,
            priority: "HIGH",
            createdAt: asDate(p.createdAt),
            dedupeKey: `${p.dedupeKey}:poster`,
            idempotencyKey: `${p.dedupeKey}:poster`,
            metadata: { jobId: p.jobId, cancelRequestId: p.cancelRequestId, adminId: p.adminId },
          },
          tx,
        );
        return;
      }

      case "JOB_ASSIGNED_CANCELLATION_RESOLVED": {
        const p = event.payload;
        const now = new Date();

        // Build human-readable messages based on resolutionType
        let posterMessage: string;
        let contractorMessage: string | null = null;

        switch (p.resolutionType) {
          case "PARTIAL_REFUND_WITH_CONTRACTOR_PAYOUT":
            posterMessage = `Your job cancellation has been resolved. You have received a ${Math.round((p.refundAmountCents / (p.refundAmountCents + p.payoutAmountCents)) * 100)}% refund.`;
            contractorMessage = `The job was cancelled by the poster within the 8-hour window. You have received a 25% compensation payout.`;
            break;
          case "FULL_REFUND_WITH_CONTRACTOR_SUSPENSION":
            posterMessage = "Your job was cancelled by the contractor within the 8-hour window. You will receive a full refund.";
            contractorMessage = "You cancelled within the 8-hour penalty window. Your account has been suspended for 7 days.";
            break;
          case "FULL_REFUND":
          default:
            posterMessage = "Your job has been cancelled and a full refund has been issued.";
            break;
        }

        // Notify job poster
        if (p.jobPosterId) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.jobPosterId),
              role: "JOB_POSTER",
              type: "JOB_ASSIGNED_CANCELLATION_RESOLVED",
              title: "Job Cancellation Resolved",
              message: posterMessage,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: now,
              dedupeKey: `${p.dedupeKey}:poster`,
              idempotencyKey: `${p.dedupeKey}:poster`,
              metadata: { jobId: p.jobId, resolutionType: p.resolutionType, refundAmountCents: p.refundAmountCents },
            },
            tx,
          );
        }

        // Notify contractor if applicable
        if (p.contractorId && contractorMessage) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(p.contractorId),
              role: "CONTRACTOR",
              type: "JOB_ASSIGNED_CANCELLATION_RESOLVED",
              title: p.suspensionApplied ? "Account Suspended" : "Job Cancellation Resolved",
              message: contractorMessage,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "HIGH",
              createdAt: now,
              dedupeKey: `${p.dedupeKey}:contractor`,
              idempotencyKey: `${p.dedupeKey}:contractor`,
              metadata: { jobId: p.jobId, resolutionType: p.resolutionType, suspensionApplied: p.suspensionApplied },
            },
            tx,
          );
        }

        // Notify admins
        const adminIds = await getActiveAdminIds(tx);
        for (const adminId of adminIds) {
          await safeNotify(
            event.type,
            p,
            {
              userId: String(adminId),
              role: "ADMIN",
              type: "JOB_ASSIGNED_CANCELLATION_RESOLVED",
              title: "Assigned Cancellation Resolved",
              message: `Job ${p.jobId} cancellation resolved: ${p.resolutionType}`,
              entityType: asEntity("JOB"),
              entityId: p.jobId,
              priority: "NORMAL",
              createdAt: now,
              dedupeKey: `${p.dedupeKey}:admin:${adminId}`,
              idempotencyKey: `${p.dedupeKey}:admin:${adminId}`,
              metadata: { jobId: p.jobId, resolutionType: p.resolutionType, adminId: p.adminId },
            },
            tx,
          );
        }
        return;
      }

      case "JOB_UPDATED":
      case "JOB_ARCHIVED":
      case "JOB_DELETED":
        // SEO-only events — handled exclusively by seoEventHandler, no notifications needed
        return;

      default: {
        const _never: never = event;
        return _never;
      }
    }
  };

  if (mode === "best_effort") {
    try {
      await run();
    } catch (error) {
      console.error("[NOTIFICATION_EVENT_MAPPER_ERROR]", {
        eventType: event.type,
        payload: event.payload,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  await run();
}

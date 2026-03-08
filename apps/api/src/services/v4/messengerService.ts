import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { v4CompletionReports } from "@/db/schema/v4CompletionReport";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4MessengerAppointments } from "@/db/schema/v4MessengerAppointment";
import { appendSystemMessage } from "@/src/services/v4/v4MessageService";
import { contractorMarkComplete, posterMarkComplete } from "@/src/services/v4/jobExecutionService";
import { badRequest, conflict, forbidden } from "@/src/services/v4/v4Errors";
import { analyzeCompletionForMisconduct } from "@/src/services/v4/misconductDetectionService";
import { recomputeScoreAppraisalForUser } from "@/src/services/v4/scoreAppraisalService";

export type MessengerRole = "CONTRACTOR" | "JOB_POSTER";

export type TimeRemaining = {
  milliseconds: number;
  totalMinutes: number;
  hours: number;
  minutes: number;
  lateAction: boolean;
};

export type MessengerAppointmentView = {
  id: string;
  threadId: string;
  status: string;
  scheduledAtUTC: string;
  timeRemaining: TimeRemaining;
} | null;

function parseScheduledAt(raw: string): Date {
  const value = String(raw ?? "").trim();
  if (!value) throw badRequest("V4_INVALID_APPOINTMENT", "scheduledAtUTC is required");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest("V4_INVALID_APPOINTMENT", "scheduledAtUTC must be a valid ISO timestamp");
  return d;
}

function parseCompletedAt(raw: { completedAtUTC?: string; completedOn?: string; completedTime?: string }): Date {
  const iso = String(raw.completedAtUTC ?? "").trim();
  if (iso) {
    const byIso = new Date(iso);
    if (!Number.isNaN(byIso.getTime())) return byIso;
  }

  const datePart = String(raw.completedOn ?? "").trim();
  const timePart = String(raw.completedTime ?? "").trim();
  if (!datePart || !timePart) {
    throw badRequest(
      "V4_COMPLETION_TIME_REQUIRED",
      "Provide completedAtUTC or both completedOn (YYYY-MM-DD) and completedTime (HH:MM)",
    );
  }

  const merged = `${datePart}T${timePart}:00Z`;
  const parsed = new Date(merged);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest("V4_COMPLETION_TIME_INVALID", "Invalid completion date/time");
  }
  return parsed;
}

function ratingOrNull(raw: unknown, label: string, required: boolean): number | null {
  if (raw === undefined || raw === null || raw === "") {
    if (required) throw badRequest("V4_RATING_REQUIRED", `${label} rating is required`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10) {
    throw badRequest("V4_RATING_OUT_OF_RANGE", `${label} rating must be between 0 and 10`);
  }
  return Math.round(n);
}

function roleLabel(role: MessengerRole): "Poster" | "Contractor" {
  return role === "JOB_POSTER" ? "Poster" : "Contractor";
}

function actorLabel(role: MessengerRole): "Job Poster" | "Contractor" {
  return role === "JOB_POSTER" ? "Job Poster" : "Contractor";
}

function formatUtcForSystemMessage(d: Date): string {
  return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function computeTimeRemaining(scheduledAtUTC: Date, now = new Date()): TimeRemaining {
  const deltaMs = scheduledAtUTC.getTime() - now.getTime();
  const bounded = Number.isFinite(deltaMs) ? deltaMs : 0;
  const absMinutes = Math.max(0, Math.floor(bounded / (60 * 1000)));
  return {
    milliseconds: bounded,
    totalMinutes: absMinutes,
    hours: Math.floor(absMinutes / 60),
    minutes: absMinutes % 60,
    lateAction: bounded < 8 * 60 * 60 * 1000,
  };
}

async function getThreadForRole(threadId: string, userId: string, role: MessengerRole) {
  const rows = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      status: v4MessageThreads.status,
      endedAt: v4MessageThreads.endedAt,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
      jobTitle: jobs.title,
      jobScope: jobs.scope,
      tradeCategory: jobs.trade_category,
      jobCity: jobs.city,
      jobRegion: jobs.region,
      amountCents: jobs.amount_cents,
      totalAmountCents: jobs.total_amount_cents,
      contractorPayoutCents: jobs.contractor_payout_cents,
      appointmentAt: jobs.appointment_at,
      posterNameFirst: jobPosterProfilesV4.firstName,
      posterNameLast: jobPosterProfilesV4.lastName,
      contractorName: contractorProfilesV4.contactName,
      contractorBusinessName: contractorProfilesV4.businessName,
      contractorYearsExperience: contractorProfilesV4.yearsExperience,
      contractorTradeCategories: contractorProfilesV4.tradeCategories,
      contractorProfileCity: contractorProfilesV4.city,
      contractorServiceRadiusKm: contractorProfilesV4.serviceRadiusKm,
      contractorRegionCode: contractorAccounts.regionCode,
    })
    .from(v4MessageThreads)
    .innerJoin(jobs, eq(jobs.id, v4MessageThreads.jobId))
    .leftJoin(jobPosterProfilesV4, eq(jobPosterProfilesV4.userId, v4MessageThreads.jobPosterUserId))
    .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, v4MessageThreads.contractorUserId))
    .leftJoin(contractorAccounts, eq(contractorAccounts.userId, v4MessageThreads.contractorUserId))
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const thread = rows[0] ?? null;
  if (!thread) throw badRequest("V4_THREAD_NOT_FOUND", "Thread not found");

  const isPoster = userId === thread.jobPosterUserId;
  const isContractor = userId === thread.contractorUserId;
  if (!isPoster && !isContractor) throw forbidden("V4_THREAD_FORBIDDEN", "You are not a participant in this thread");

  if (role === "JOB_POSTER" && !isPoster) throw forbidden("V4_ROLE_MISMATCH", "Job poster access required");
  if (role === "CONTRACTOR" && !isContractor) throw forbidden("V4_ROLE_MISMATCH", "Contractor access required");

  return thread;
}

function assertThreadActive(thread: { status: string }) {
  if (String(thread.status ?? "").toUpperCase() === "ENDED") {
    throw Object.assign(forbidden("V4_CONVERSATION_ENDED", "Conversation Ended"), {
      status: 403,
    });
  }
}

async function getAppointmentRow(threadId: string) {
  const rows = await db
    .select({
      id: v4MessengerAppointments.id,
      threadId: v4MessengerAppointments.threadId,
      scheduledAtUTC: v4MessengerAppointments.scheduledAtUTC,
      status: v4MessengerAppointments.status,
      createdAt: v4MessengerAppointments.createdAt,
      updatedAt: v4MessengerAppointments.updatedAt,
    })
    .from(v4MessengerAppointments)
    .where(eq(v4MessengerAppointments.threadId, threadId))
    .limit(1);
  return rows[0] ?? null;
}

function mapAppointmentView(appointment: {
  id: string;
  threadId: string;
  status: string;
  scheduledAtUTC: Date;
} | null): MessengerAppointmentView {
  if (!appointment) return null;
  return {
    id: appointment.id,
    threadId: appointment.threadId,
    status: String(appointment.status ?? "SCHEDULED"),
    scheduledAtUTC: appointment.scheduledAtUTC.toISOString(),
    timeRemaining: computeTimeRemaining(appointment.scheduledAtUTC),
  };
}

async function applyLateActionPenalties(input: {
  contractorUserId: string;
  jobPosterUserId: string;
  threadId: string;
  jobId: string;
  now: Date;
  reason: string;
}) {
  // Refund handling is owned by payment services; messenger stores auditable intent only.
  const suspendedUntil = new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(users)
    .set({
      status: "SUSPENDED" as any,
      accountStatus: "SUSPENDED_PENDING_REVIEW",
      suspendedUntil,
      suspensionReason: input.reason,
      updatedAt: input.now,
    })
    .where(eq(users.id, input.contractorUserId));

  await appendSystemMessage(
    input.threadId,
    `Late action penalties applied. Contractor access is suspended until ${formatUtcForSystemMessage(suspendedUntil)}.`,
  );

  return {
    posterRefundPercentage: 50,
    contractorSuspendedUntil: suspendedUntil.toISOString(),
  };
}

export async function getThreadAppointment(threadId: string, userId: string, role: MessengerRole) {
  await getThreadForRole(threadId, userId, role);
  const appointment = await getAppointmentRow(threadId);
  return mapAppointmentView(appointment);
}

export async function bookThreadAppointment(input: {
  threadId: string;
  userId: string;
  role: MessengerRole;
  scheduledAtUTC: string;
}) {
  const thread = await getThreadForRole(input.threadId, input.userId, input.role);
  if (input.role !== "CONTRACTOR") {
    throw forbidden("V4_ROLE_MISMATCH", "Only contractor can book appointment");
  }
  assertThreadActive(thread);

  const scheduledAt = parseScheduledAt(input.scheduledAtUTC);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(v4MessengerAppointments)
      .values({
        id: randomUUID(),
        threadId: thread.id,
        scheduledAtUTC: scheduledAt,
        status: "SCHEDULED",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: v4MessengerAppointments.threadId,
        set: {
          scheduledAtUTC: scheduledAt,
          status: "SCHEDULED",
          updatedAt: now,
        },
      });

    await tx
      .update(jobs)
      .set({
        status: "PUBLISHED" as any,
        appointment_at: scheduledAt,
        appointment_published_at: now,
        appointment_accepted_at: null,
        updated_at: now,
      })
      .where(eq(jobs.id, thread.jobId));

    await tx.insert(v4EventOutbox).values({
      id: randomUUID(),
      eventType: "APPOINTMENT_BOOKED",
      payload: {
        jobId: thread.jobId,
        jobPosterId: thread.jobPosterUserId,
        createdAt: now.toISOString(),
        dedupeKey: `appointment_booked:${thread.id}:${scheduledAt.toISOString()}`,
      } as Record<string, unknown>,
      createdAt: now,
    });
  });

  await appendSystemMessage(thread.id, `Appointment booked for ${formatUtcForSystemMessage(scheduledAt)}.`);

  const appointment = await getAppointmentRow(thread.id);
  return {
    ok: true as const,
    appointment: mapAppointmentView(appointment),
  };
}

export async function rescheduleThreadAppointment(input: {
  threadId: string;
  userId: string;
  role: MessengerRole;
  scheduledAtUTC: string;
}) {
  const thread = await getThreadForRole(input.threadId, input.userId, input.role);
  assertThreadActive(thread);

  const appointment = await getAppointmentRow(thread.id);
  if (!appointment || String(appointment.status ?? "").toUpperCase() === "CANCELED") {
    throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Appointment must be booked before rescheduling");
  }

  const now = new Date();
  const timeRemaining = computeTimeRemaining(appointment.scheduledAtUTC, now);
  const nextAppointment = parseScheduledAt(input.scheduledAtUTC);

  let penalties: { posterRefundPercentage: number; contractorSuspendedUntil: string } | null = null;

  await db.transaction(async (tx) => {
    await tx
      .update(v4MessengerAppointments)
      .set({
        scheduledAtUTC: nextAppointment,
        status: "RESCHEDULED",
        updatedAt: now,
      })
      .where(eq(v4MessengerAppointments.threadId, thread.id));

    await tx
      .update(jobs)
      .set({
        status: "PUBLISHED" as any,
        appointment_at: nextAppointment,
        appointment_published_at: now,
        appointment_accepted_at: null,
        updated_at: now,
      })
      .where(eq(jobs.id, thread.jobId));
  });

  await appendSystemMessage(thread.id, `Appointment rescheduled to ${formatUtcForSystemMessage(nextAppointment)}.`);

  if (timeRemaining.lateAction) {
    penalties = await applyLateActionPenalties({
      contractorUserId: thread.contractorUserId,
      jobPosterUserId: thread.jobPosterUserId,
      threadId: thread.id,
      jobId: thread.jobId,
      now,
      reason: "Late reschedule within 8 hours",
    });
  }

  return {
    ok: true as const,
    appointment: mapAppointmentView({
      id: appointment.id,
      threadId: thread.id,
      status: "RESCHEDULED",
      scheduledAtUTC: nextAppointment,
    }),
    timeRemaining,
    lateAction: timeRemaining.lateAction,
    penalties,
  };
}

export async function cancelThreadAppointment(input: {
  threadId: string;
  userId: string;
  role: MessengerRole;
}) {
  const thread = await getThreadForRole(input.threadId, input.userId, input.role);
  assertThreadActive(thread);

  const appointment = await getAppointmentRow(thread.id);
  if (!appointment || String(appointment.status ?? "").toUpperCase() === "CANCELED") {
    throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Appointment must be booked before canceling");
  }

  const now = new Date();
  const timeRemaining = computeTimeRemaining(appointment.scheduledAtUTC, now);

  let penalties: { posterRefundPercentage: number; contractorSuspendedUntil: string } | null = null;

  await db.transaction(async (tx) => {
    await tx
      .update(v4MessengerAppointments)
      .set({
        status: "CANCELED",
        updatedAt: now,
      })
      .where(eq(v4MessengerAppointments.threadId, thread.id));

    await tx
      .update(jobs)
      .set({
        appointment_at: null,
        appointment_published_at: null,
        appointment_accepted_at: null,
        updated_at: now,
      })
      .where(eq(jobs.id, thread.jobId));
  });

  await appendSystemMessage(thread.id, `Job canceled by ${actorLabel(input.role)}.`);

  if (timeRemaining.lateAction) {
    penalties = await applyLateActionPenalties({
      contractorUserId: thread.contractorUserId,
      jobPosterUserId: thread.jobPosterUserId,
      threadId: thread.id,
      jobId: thread.jobId,
      now,
      reason: "Late cancellation within 8 hours",
    });
    await appendSystemMessage(thread.id, "Late cancellation penalties applied.");
  }

  return {
    ok: true as const,
    appointment: mapAppointmentView({
      id: appointment.id,
      threadId: thread.id,
      status: "CANCELED",
      scheduledAtUTC: appointment.scheduledAtUTC,
    }),
    timeRemaining,
    lateAction: timeRemaining.lateAction,
    penalties,
  };
}

export async function submitThreadCompletionReport(input: {
  threadId: string;
  userId: string;
  role: MessengerRole;
  completedAtUTC?: string;
  completedOn?: string;
  completedTime?: string;
  summaryText: string;
  punctuality?: unknown;
  communication?: unknown;
  quality?: unknown;
  cooperation?: unknown;
}) {
  const thread = await getThreadForRole(input.threadId, input.userId, input.role);
  assertThreadActive(thread);

  const summaryText = String(input.summaryText ?? "").trim();
  if (!summaryText) throw badRequest("V4_COMPLETION_SUMMARY_REQUIRED", "Job Summary is required");

  const appointment = await getAppointmentRow(thread.id);
  const scheduledAt = appointment?.scheduledAtUTC ?? thread.appointmentAt;
  if (!(scheduledAt instanceof Date)) {
    throw conflict("V4_APPOINTMENT_NOT_BOOKED", "Appointment must be booked before completing job");
  }
  const now = new Date();
  if (now.getTime() < scheduledAt.getTime()) {
    throw conflict("V4_APPOINTMENT_NOT_REACHED", "Complete Job is available once appointment time is reached");
  }

  const completedAt = parseCompletedAt(input);

  const isPoster = input.role === "JOB_POSTER";
  const punctuality = ratingOrNull(input.punctuality, "Punctuality", isPoster);
  const communication = ratingOrNull(input.communication, "Communication", true);
  const quality = ratingOrNull(input.quality, "Quality", isPoster);
  const cooperation = ratingOrNull(input.cooperation, "Cooperation", !isPoster);

  const existingRows = await db
    .select({ id: v4CompletionReports.id })
    .from(v4CompletionReports)
    .where(and(eq(v4CompletionReports.threadId, thread.id), eq(v4CompletionReports.submittedByRole, input.role)))
    .limit(1);

  let created = false;
  let reportId = existingRows[0]?.id ?? randomUUID();

  if (!existingRows[0]?.id) {
    await db.insert(v4CompletionReports).values({
      id: reportId,
      threadId: thread.id,
      submittedByRole: input.role,
      completedAtUTC: completedAt,
      summaryText,
      punctuality: isPoster ? (punctuality as number) : null,
      communication: communication as number,
      quality: isPoster ? (quality as number) : null,
      cooperation: isPoster ? null : (cooperation as number),
      createdAt: now,
    });

    created = true;
    await appendSystemMessage(thread.id, `Job completion report submitted by ${roleLabel(input.role)}.`);

    if (input.role === "CONTRACTOR") {
      await contractorMarkComplete({ contractorUserId: input.userId, jobId: thread.jobId });
    } else {
      await posterMarkComplete({ jobPosterUserId: input.userId, jobId: thread.jobId });
    }

    await analyzeCompletionForMisconduct({
      threadId: thread.id,
      jobId: thread.jobId,
      submittedByRole: input.role,
      submittedByUserId: input.userId,
      summaryText,
    });
  }

  const reports = await db
    .select({ submittedByRole: v4CompletionReports.submittedByRole })
    .from(v4CompletionReports)
    .where(eq(v4CompletionReports.threadId, thread.id));

  const hasPoster = reports.some((r) => String(r.submittedByRole).toUpperCase() === "JOB_POSTER");
  const hasContractor = reports.some((r) => String(r.submittedByRole).toUpperCase() === "CONTRACTOR");
  const shouldEndConversation = hasPoster && hasContractor;

  if (shouldEndConversation) {
    const threadRows = await db
      .select({ status: v4MessageThreads.status })
      .from(v4MessageThreads)
      .where(eq(v4MessageThreads.id, thread.id))
      .limit(1);
    const alreadyEnded = String(threadRows[0]?.status ?? "").toUpperCase() === "ENDED";

    if (!alreadyEnded) {
      await db
        .update(v4MessageThreads)
        .set({
          status: "ENDED",
          endedAt: now,
        })
        .where(eq(v4MessageThreads.id, thread.id));

      await appendSystemMessage(thread.id, "Conversation Ended.");
      await appendSystemMessage(thread.id, "Visit your dashboard to release funds.");
    }

    await Promise.allSettled([
      recomputeScoreAppraisalForUser(thread.contractorUserId, "CONTRACTOR"),
      recomputeScoreAppraisalForUser(thread.jobPosterUserId, "POSTER"),
    ]);
  }

  return {
    ok: true as const,
    id: reportId,
    created,
    conversationEnded: shouldEndConversation,
  };
}

export async function getThreadSummaryForRole(threadId: string, userId: string, role: MessengerRole) {
  const thread = await getThreadForRole(threadId, userId, role);
  const appointment = await getAppointmentRow(thread.id);

  const appointmentDetails = appointment
    ? {
        scheduledAtUTC: appointment.scheduledAtUTC.toISOString(),
        status: appointment.status,
        timeRemaining: computeTimeRemaining(appointment.scheduledAtUTC),
      }
    : null;

  if (role === "JOB_POSTER") {
    return {
      role,
      contractor: {
        name: String(thread.contractorName ?? "").trim() || "Assigned Contractor",
        businessName: String(thread.contractorBusinessName ?? "").trim() || null,
        trades: Array.isArray(thread.contractorTradeCategories) ? thread.contractorTradeCategories : [],
        yearsExperience:
          typeof thread.contractorYearsExperience === "number" && Number.isFinite(thread.contractorYearsExperience)
            ? thread.contractorYearsExperience
            : null,
        serviceRegion:
          [String(thread.contractorProfileCity ?? "").trim(), String(thread.contractorRegionCode ?? "").trim()]
            .filter(Boolean)
            .join(", ") || null,
        serviceRadiusKm:
          typeof thread.contractorServiceRadiusKm === "number" && Number.isFinite(thread.contractorServiceRadiusKm)
            ? thread.contractorServiceRadiusKm
            : null,
      },
      appointment: appointmentDetails,
      reminders: ["Reschedule or cancel outside 8 hours to avoid penalties."],
    };
  }

  return {
    role,
    jobPoster: {
      name: [String(thread.posterNameFirst ?? "").trim(), String(thread.posterNameLast ?? "").trim()]
        .filter(Boolean)
        .join(" ") || "Job Poster",
      location: [String(thread.jobCity ?? "").trim(), String(thread.jobRegion ?? "").trim()].filter(Boolean).join(", ") || null,
    },
    job: {
      title: thread.jobTitle ?? "Job",
      category: thread.tradeCategory ?? null,
      description: thread.jobScope ?? null,
      feeSummary: {
        amountCents: Number(thread.amountCents ?? 0),
        totalAmountCents: Number(thread.totalAmountCents ?? 0),
        contractorPayoutCents: Number(thread.contractorPayoutCents ?? 0),
      },
    },
    appointment: appointmentDetails,
    reminders: ["Reschedule or cancel outside 8 hours to avoid penalties."],
  };
}

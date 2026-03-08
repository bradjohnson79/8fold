export type NotificationEntityType = "JOB" | "INVITE" | "THREAD" | "PAYMENT" | "SYSTEM";

export const DOMAIN_EVENT_TYPES = [
  "ROUTER_JOB_ROUTED",
  "CONTRACTOR_INVITE_EXPIRED",
  "CONTRACTOR_ACCEPTED_INVITE",
  "CONTRACTOR_REJECTED_INVITE",
  "POSTER_ACCEPTED_CONTRACTOR",
  "APPOINTMENT_BOOKED",
  "APPOINTMENT_ACCEPTED",
  "RESCHEDULE_REQUESTED",
  "JOB_PUBLISHED",
  "CUSTOMER_CANCELLED",
  "CONTRACTOR_CANCELLED",
  "BREACH_APPLIED",
  "SUSPENSION_APPLIED",
  "PAYMENT_CAPTURED",
  "REFUND_ISSUED",
  "FUNDS_RELEASED",
  "FUNDS_RELEASE_ELIGIBLE",
  "CONTRACTOR_COMPLETED",
  "JOB_STARTED",
  "CONTRACTOR_MARKED_COMPLETE",
  "POSTER_MARKED_COMPLETE",
  "JOB_COMPLETED",
  "JOB_COMPLETED_FINALIZED",
  "NEW_MESSAGE",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export type DomainEventPayloadByType = {
  ROUTER_JOB_ROUTED: {
    jobId: string;
    contractorId: string;
    jobTitle?: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  CONTRACTOR_INVITE_EXPIRED: {
    inviteId: string;
    jobId: string;
    contractorId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKey: string;
  };
  CONTRACTOR_ACCEPTED_INVITE: {
    jobId: string;
    inviteId: string;
    contractorId: string;
    jobPosterId: string;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  CONTRACTOR_REJECTED_INVITE: {
    inviteId: string;
    jobId: string;
    jobPosterId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  POSTER_ACCEPTED_CONTRACTOR: {
    jobId: string;
    contractorId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  APPOINTMENT_BOOKED: {
    jobId: string;
    jobPosterId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  APPOINTMENT_ACCEPTED: {
    jobId: string;
    contractorId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  RESCHEDULE_REQUESTED: {
    jobId: string;
    jobPosterId: string;
    appointmentAt: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  JOB_PUBLISHED: {
    jobId: string;
    jobPosterId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  CUSTOMER_CANCELLED: {
    jobId: string;
    contractorId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  CONTRACTOR_CANCELLED: {
    jobId: string;
    jobPosterId?: string | null;
    routerId?: string | null;
    message: string;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  BREACH_APPLIED: {
    jobId: string;
    contractorId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  SUSPENSION_APPLIED: {
    contractorId: string;
    createdAt?: Date;
    dedupeKey: string;
  };
  PAYMENT_CAPTURED: {
    jobId: string;
    jobPosterId: string;
    adminIds?: string[];
    createdAt?: Date;
    dedupeKeyBase: string;
    metadata?: Record<string, unknown>;
  };
  REFUND_ISSUED: {
    jobId: string;
    refundId: string;
    jobPosterId?: string | null;
    adminIds?: string[];
    createdAt?: Date;
    dedupeKeyBase: string;
    metadata?: Record<string, unknown>;
  };
  FUNDS_RELEASED: {
    jobId: string;
    contractorId?: string | null;
    routerId?: string | null;
    jobPosterId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  FUNDS_RELEASE_ELIGIBLE: {
    jobId: string;
    contractorId?: string | null;
    jobPosterId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  CONTRACTOR_COMPLETED: {
    jobId: string;
    jobPosterId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  JOB_STARTED: {
    jobId: string;
    contractorId?: string | null;
    jobPosterId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  CONTRACTOR_MARKED_COMPLETE: {
    jobId: string;
    contractorId: string;
    jobPosterId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  POSTER_MARKED_COMPLETE: {
    jobId: string;
    jobPosterId: string;
    contractorId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  JOB_COMPLETED: {
    jobId: string;
    contractorId?: string | null;
    jobPosterId?: string | null;
    completedAt?: string;
    dedupeKeyBase: string;
  };
  JOB_COMPLETED_FINALIZED: {
    jobId: string;
    contractorId?: string | null;
    jobPosterId?: string | null;
    routerId?: string | null;
    createdAt?: Date;
    dedupeKeyBase: string;
  };
  NEW_MESSAGE: {
    jobId: string;
    threadId: string;
    messageId: string;
    recipientUserId: string;
    recipientRole: "CONTRACTOR" | "JOB_POSTER" | "ROUTER" | "ADMIN";
    createdAt?: Date;
    dedupeKey: string;
  };
};

export type DomainEvent<T extends DomainEventType = DomainEventType> = {
  [K in T]: {
    type: K;
    payload: DomainEventPayloadByType[K];
  };
}[T];

export type DomainEventDispatchMode = "within_tx" | "best_effort";

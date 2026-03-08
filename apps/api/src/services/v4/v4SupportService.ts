import { randomUUID } from "crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { disputes } from "@/db/schema/dispute";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4SupportMessages } from "@/db/schema/v4SupportMessage";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";

export const V4_SUPPORT_TICKET_TYPES = [
  "GENERAL_SUPPORT",
  "JOB_ISSUE",
  "PAYMENT_ISSUE",
  "DISPUTE",
  "SECOND_APPRAISAL",
  "ROUTING_ISSUE",
  "ACCOUNT_SUPPORT",
] as const;

export type V4SupportTicketType = (typeof V4_SUPPORT_TICKET_TYPES)[number];

// Legacy categories kept for backward compat
export const V4_SUPPORT_CATEGORIES = [
  "GENERAL INQUIRY",
  "TECHNICAL INQUIRY",
  "REPORT A BUG",
  "REPORT A NO-SHOW",
  "DISPUTE",
  ...V4_SUPPORT_TICKET_TYPES,
] as const;

export const V4_TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type V4TicketPriority = (typeof V4_TICKET_PRIORITIES)[number];

export const V4_TICKET_STATUSES = [
  "OPEN",
  "ADMIN_REPLY",
  "USER_REPLY",
  "RESOLVED",
  "CLOSED",
] as const;

function normalizeCategory(raw: string): string {
  const v = String(raw ?? "").trim().toUpperCase().replace(/ /g, "_");
  const mapped: Record<string, string> = {
    "GENERAL_INQUIRY": "GENERAL INQUIRY",
    "TECHNICAL_INQUIRY": "TECHNICAL INQUIRY",
    "REPORT_A_BUG": "REPORT A BUG",
    "REPORT_A_NO-SHOW": "REPORT A NO-SHOW",
  };
  return mapped[v] ?? raw;
}

export async function createSupportTicket(
  userId: string,
  role: string,
  subject: string,
  category: string,
  body: string,
  context?: {
    jobId?: string | null;
    conversationId?: string | null;
    attachmentPointers?: unknown;
    ticketType?: string | null;
    priority?: string | null;
  },
): Promise<{ id: string; routedTo: "SUPPORT_TICKET" | "DISPUTE" }> {
  const sub = String(subject ?? "").trim();
  const b = String(body ?? "").trim();
  if (!sub) throw new Error("Subject is required");
  if (!b) throw new Error("Body is required");

  const id = randomUUID();
  const now = new Date();
  const priority = V4_TICKET_PRIORITIES.includes(
    String(context?.priority ?? "").toUpperCase() as V4TicketPriority,
  )
    ? (String(context?.priority).toUpperCase() as V4TicketPriority)
    : "NORMAL";

  const cat = normalizeCategory(category);
  const effectiveType = context?.ticketType ?? category;

  if (cat === "DISPUTE" || effectiveType === "DISPUTE") {
    await db.insert(disputes).values({
      id,
      userId,
      role,
      jobId: context?.jobId ?? null,
      conversationId: context?.conversationId ?? null,
      subject: sub,
      message: b,
      status: "OPEN",
      attachmentPointers: (context?.attachmentPointers as any) ?? null,
      createdAt: now,
    });
    return { id, routedTo: "DISPUTE" };
  }

  await db.insert(v4SupportTickets).values({
    id,
    userId,
    role,
    subject: sub,
    category: cat,
    ticketType: effectiveType,
    priority,
    jobId: context?.jobId ?? null,
    body: b,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  });

  // Seed the first message from the initial body
  await db.insert(v4SupportMessages).values({
    id: randomUUID(),
    ticketId: id,
    senderUserId: userId,
    senderRole: role,
    message: b,
    createdAt: now,
  });

  // Emit outbox event for admin notification
  await db.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "NEW_SUPPORT_TICKET",
    payload: { ticketId: id, userId, role, subject: sub, dedupeKey: `support_ticket_created_${id}` },
    createdAt: now,
  });

  return { id, routedTo: "SUPPORT_TICKET" };
}

export async function listSupportTicketsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<Array<{
  id: string;
  subject: string;
  category: string;
  ticketType: string | null;
  status: string;
  priority: string;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}>> {
  const limit = Math.min(Math.max(Number(options?.limit ?? 50), 1), 100);

  const rows = await db
    .select()
    .from(v4SupportTickets)
    .where(eq(v4SupportTickets.userId, userId))
    .orderBy(desc(v4SupportTickets.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    category: r.category,
    ticketType: r.ticketType,
    status: r.status,
    priority: r.priority,
    jobId: r.jobId,
    createdAt: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: r.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }));
}

export async function getSupportTicketWithMessages(
  ticketId: string,
  userId: string,
): Promise<{
  ticket: {
    id: string;
    subject: string;
    category: string;
    ticketType: string | null;
    status: string;
    priority: string;
    jobId: string | null;
    body: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    senderUserId: string;
    senderRole: string;
    message: string;
    createdAt: string;
  }>;
} | null> {
  const rows = await db
    .select()
    .from(v4SupportTickets)
    .where(and(eq(v4SupportTickets.id, ticketId), eq(v4SupportTickets.userId, userId)))
    .limit(1);

  const ticket = rows[0];
  if (!ticket) return null;

  const msgs = await db
    .select()
    .from(v4SupportMessages)
    .where(eq(v4SupportMessages.ticketId, ticketId))
    .orderBy(asc(v4SupportMessages.createdAt));

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      ticketType: ticket.ticketType,
      status: ticket.status,
      priority: ticket.priority,
      jobId: ticket.jobId,
      body: ticket.body,
      createdAt: ticket.createdAt?.toISOString?.() ?? "",
      updatedAt: ticket.updatedAt?.toISOString?.() ?? "",
    },
    messages: msgs.map((m) => ({
      id: m.id,
      senderUserId: m.senderUserId,
      senderRole: m.senderRole,
      message: m.message,
      createdAt: m.createdAt?.toISOString?.() ?? "",
    })),
  };
}

export async function replyToSupportTicket(
  ticketId: string,
  userId: string,
  role: string,
  message: string,
): Promise<{ messageId: string }> {
  const msg = String(message ?? "").trim();
  if (!msg) throw new Error("Message is required");

  const rows = await db
    .select({ id: v4SupportTickets.id })
    .from(v4SupportTickets)
    .where(and(eq(v4SupportTickets.id, ticketId), eq(v4SupportTickets.userId, userId)))
    .limit(1);

  if (!rows[0]) throw Object.assign(new Error("Ticket not found"), { status: 404 });

  const now = new Date();
  const messageId = randomUUID();

  await db.insert(v4SupportMessages).values({
    id: messageId,
    ticketId,
    senderUserId: userId,
    senderRole: role,
    message: msg,
    createdAt: now,
  });

  await db
    .update(v4SupportTickets)
    .set({ status: "USER_REPLY", updatedAt: now })
    .where(eq(v4SupportTickets.id, ticketId));

  return { messageId };
}

export async function adminReplyToSupportTicket(
  ticketId: string,
  adminUserId: string,
  message: string,
): Promise<{ messageId: string; recipientUserId: string }> {
  const msg = String(message ?? "").trim();
  if (!msg) throw new Error("Message is required");

  const rows = await db
    .select({ id: v4SupportTickets.id, userId: v4SupportTickets.userId, role: v4SupportTickets.role, subject: v4SupportTickets.subject })
    .from(v4SupportTickets)
    .where(eq(v4SupportTickets.id, ticketId))
    .limit(1);

  const ticket = rows[0];
  if (!ticket) throw Object.assign(new Error("Ticket not found"), { status: 404 });

  const now = new Date();
  const messageId = randomUUID();

  await db.insert(v4SupportMessages).values({
    id: messageId,
    ticketId,
    senderUserId: adminUserId,
    senderRole: "ADMIN",
    message: msg,
    createdAt: now,
  });

  await db
    .update(v4SupportTickets)
    .set({ status: "ADMIN_REPLY", updatedAt: now })
    .where(eq(v4SupportTickets.id, ticketId));

  // Emit outbox event to notify the user
  await db.insert(v4EventOutbox).values({
    id: randomUUID(),
    eventType: "SUPPORT_REPLY",
    payload: {
      ticketId,
      userId: ticket.userId,
      userRole: ticket.role,
      subject: ticket.subject,
      replierRole: "ADMIN",
      dedupeKey: `support_reply_${messageId}`,
    },
    createdAt: now,
  });

  return { messageId, recipientUserId: ticket.userId };
}

export async function adminGetSupportTicketWithMessages(ticketId: string): Promise<{
  ticket: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
} | null> {
  const rows = await db
    .select()
    .from(v4SupportTickets)
    .where(eq(v4SupportTickets.id, ticketId))
    .limit(1);

  const ticket = rows[0];
  if (!ticket) return null;

  const msgs = await db
    .select()
    .from(v4SupportMessages)
    .where(eq(v4SupportMessages.ticketId, ticketId))
    .orderBy(asc(v4SupportMessages.createdAt));

  return {
    ticket: {
      id: ticket.id,
      userId: ticket.userId,
      role: ticket.role,
      subject: ticket.subject,
      category: ticket.category,
      ticketType: ticket.ticketType,
      status: ticket.status,
      priority: ticket.priority,
      jobId: ticket.jobId,
      body: ticket.body,
      createdAt: ticket.createdAt?.toISOString?.() ?? "",
      updatedAt: ticket.updatedAt?.toISOString?.() ?? "",
    },
    messages: msgs.map((m) => ({
      id: m.id,
      ticketId: m.ticketId,
      senderUserId: m.senderUserId,
      senderRole: m.senderRole,
      message: m.message,
      createdAt: m.createdAt?.toISOString?.() ?? "",
    })),
  };
}

export async function adminListSupportTickets(options?: {
  status?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(Number(options?.limit ?? 100), 1), 200);

  const query = db
    .select()
    .from(v4SupportTickets)
    .orderBy(desc(v4SupportTickets.updatedAt))
    .limit(limit);

  const rows = options?.status
    ? await db
        .select()
        .from(v4SupportTickets)
        .where(eq(v4SupportTickets.status, options.status))
        .orderBy(desc(v4SupportTickets.updatedAt))
        .limit(limit)
    : await query;

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    role: r.role,
    subject: r.subject,
    category: r.category,
    ticketType: r.ticketType,
    status: r.status,
    priority: r.priority,
    jobId: r.jobId,
    createdAt: r.createdAt?.toISOString?.() ?? "",
    updatedAt: r.updatedAt?.toISOString?.() ?? "",
  }));
}

export async function adminUpdateTicketStatus(
  ticketId: string,
  status: string,
): Promise<void> {
  await db
    .update(v4SupportTickets)
    .set({ status, updatedAt: new Date() })
    .where(eq(v4SupportTickets.id, ticketId));
}

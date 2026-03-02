import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { disputes } from "@/db/schema/dispute";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";

export const V4_SUPPORT_CATEGORIES = [
  "GENERAL INQUIRY",
  "TECHNICAL INQUIRY",
  "REPORT A BUG",
  "REPORT A NO-SHOW",
  "DISPUTE",
] as const;

export type V4SupportCategory = (typeof V4_SUPPORT_CATEGORIES)[number];

function normalizeCategory(raw: string): V4SupportCategory {
  const v = String(raw ?? "").trim().toUpperCase();
  if (V4_SUPPORT_CATEGORIES.includes(v as V4SupportCategory)) return v as V4SupportCategory;
  throw new Error("Category must be one of: GENERAL INQUIRY, TECHNICAL INQUIRY, REPORT A BUG, REPORT A NO-SHOW, DISPUTE");
}

export async function createSupportTicket(
  userId: string,
  role: string,
  subject: string,
  category: string,
  body: string,
  context?: { jobId?: string | null; conversationId?: string | null; attachmentPointers?: unknown },
): Promise<{ id: string; routedTo: "SUPPORT_TICKET" | "DISPUTE" }> {
  const sub = String(subject ?? "").trim();
  const cat = normalizeCategory(category);
  const b = String(body ?? "").trim();
  if (!sub) throw new Error("Subject is required");
  if (!b) throw new Error("Body is required");

  const id = randomUUID();
  const now = new Date();

  if (cat === "DISPUTE") {
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
    body: b,
    status: "OPEN",
    createdAt: now,
  });

  return { id, routedTo: "SUPPORT_TICKET" };
}

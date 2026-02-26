import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { db } from "@/db/drizzle";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";

/**
 * V4 support tickets list for badge/last-seen.
 * Used by useSupportInboxBadge when on /dashboard/job-poster.
 */
export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;

  const url = new URL(req.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("take")) || 10, 1), 50);

  const rows = await db
    .select({
      id: v4SupportTickets.id,
      subject: v4SupportTickets.subject,
      status: v4SupportTickets.status,
      createdAt: v4SupportTickets.createdAt,
    })
    .from(v4SupportTickets)
    .where(eq(v4SupportTickets.userId, role.userId))
    .orderBy(desc(v4SupportTickets.createdAt))
    .limit(take);

  const tickets = rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    updatedAt: r.createdAt?.toISOString?.() ?? null,
  }));

  return NextResponse.json({ tickets });
}

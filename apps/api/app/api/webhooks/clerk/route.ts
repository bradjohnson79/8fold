import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";
import { clerkWebhookEvents } from "@/db/schema/clerkWebhookEvent";
import { getOrCreateRequestId, withRequestIdHeader } from "@/src/auth/errors/authErrorResponse";

export async function POST(req: NextRequest) {
  const requestId = getOrCreateRequestId(req);
  try {
    const evt = await verifyWebhook(req);
    const eventId = String((evt as any)?.id ?? "").trim();
    const type = String(evt?.type ?? "").trim();

    if (!eventId) {
      const resp = NextResponse.json({ ok: false, error: { code: "WEBHOOK_INVALID", message: "Missing event id" }, requestId }, { status: 400 });
      return withRequestIdHeader(resp, requestId);
    }

    const already = await db
      .insert(clerkWebhookEvents)
      .values({ eventId } as any)
      .onConflictDoNothing()
      .returning({ eventId: clerkWebhookEvents.eventId });

    if (already.length === 0) {
      // Replay/no-op.
      const resp = NextResponse.json({ ok: true, replay: true, requestId });
      return withRequestIdHeader(resp, requestId);
    }

    if (type === "user.created") {
      // Do not create internal user on Clerk user creation.
      const resp = NextResponse.json({ ok: true, handled: true, type, requestId });
      return withRequestIdHeader(resp, requestId);
    }

    if (type === "user.deleted") {
      const clerkUserId = String((evt as any)?.data?.id ?? "").trim();
      if (clerkUserId) {
        await db
          .update(users)
          .set({
            status: "ARCHIVED" as any,
            archivedAt: new Date(),
            archivedReason: "CLERK_USER_DELETED",
            updatedAt: new Date(),
          } as any)
          .where(and(eq(users.clerkUserId, clerkUserId)));
      }
      const resp = NextResponse.json({ ok: true, handled: true, type, requestId });
      return withRequestIdHeader(resp, requestId);
    }

    const resp = NextResponse.json({ ok: true, ignored: true, type, requestId });
    return withRequestIdHeader(resp, requestId);
  } catch (err) {
    const resp = NextResponse.json({ ok: false, error: { code: "WEBHOOK_VERIFICATION_FAILED", message: "Webhook verification failed" }, requestId }, { status: 400 });
    return withRequestIdHeader(resp, requestId);
  }
}


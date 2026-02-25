import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const BodySchema = z.object({
  subject: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireV4Role(req, "ROUTER");
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        toV4ErrorResponse({ status: 400, code: "V4_INVALID_REQUEST", message: "Invalid input" } as V4Error, requestId),
        { status: 400 },
      );
    }

    const id = randomUUID();
    await db.insert(v4SupportTickets).values({
      id,
      userId: authed.userId,
      role: "ROUTER",
      subject: parsed.data.subject,
      category: parsed.data.category,
      body: parsed.data.body,
      status: "OPEN",
    });

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SUPPORT_TICKET_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

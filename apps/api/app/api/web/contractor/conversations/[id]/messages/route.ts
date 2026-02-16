import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { conversations } from "../../../../../../../db/schema/conversation";
import { messages } from "../../../../../../../db/schema/message";
import { requireContractorReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { z } from "zod";
import { ensureActiveAccount } from "../../../../../../../src/server/accountGuard";

const BodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

function getIdFromUrl(req: Request): string {
  const m = new URL(req.url).pathname.match(/\/conversations\/([^/]+)\/messages\/?$/);
  return m?.[1] ?? "";
}

function containsEmail(s: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s);
}

export async function GET(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    await ensureActiveAccount(u.userId);
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const convoRows = await db
      .select({
        id: conversations.id,
        jobId: conversations.jobId,
        contractorUserId: conversations.contractorUserId,
        jobPosterUserId: conversations.jobPosterUserId,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.contractorUserId, u.userId)))
      .limit(1);
    const convo = convoRows[0] ?? null;
    if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderUserId: messages.senderUserId,
        senderRole: messages.senderRole,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, convo.id))
      .orderBy(asc(messages.createdAt))
      .limit(200);

    return NextResponse.json({
      conversation: { ...convo, createdAt: convo.createdAt.toISOString(), updatedAt: convo.updatedAt.toISOString() },
      messages: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    await ensureActiveAccount(u.userId);
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    if (containsEmail(body.data.body)) {
      return NextResponse.json({ error: "Email addresses are not allowed in messages." }, { status: 400 });
    }

    const convoRows = await db
      .select({
        id: conversations.id,
        contractorUserId: conversations.contractorUserId,
      })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.contractorUserId, u.userId)))
      .limit(1);
    const convo = convoRows[0] ?? null;
    if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const msgId = crypto.randomUUID();
    const inserted = await db
      .insert(messages)
      .values({
        id: msgId,
        conversationId: convo.id,
        senderUserId: u.userId,
        senderRole: "CONTRACTOR",
        body: body.data.body,
        createdAt: now,
      })
      .returning({
        id: messages.id,
        conversationId: messages.conversationId,
        senderUserId: messages.senderUserId,
        senderRole: messages.senderRole,
        body: messages.body,
        createdAt: messages.createdAt,
      });

    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, convo.id));

    const msg = inserted[0]!;
    return NextResponse.json({ ok: true, message: { ...msg, createdAt: msg.createdAt.toISOString() } });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}


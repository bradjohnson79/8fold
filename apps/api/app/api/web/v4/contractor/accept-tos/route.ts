import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { CURRENT_TERMS_VERSION, recordRoleTermsAcceptance } from "@/src/services/v4/roleTermsService";
import { z } from "zod";

const CONTRACTOR_TOS_VERSION = CURRENT_TERMS_VERSION.CONTRACTOR;

const AcceptTosSchema = z.object({
  accepted: z.literal(true),
  version: z.string().trim().min(1).max(20),
});

export async function GET(req: Request) {
  const authed = await requireV4Role(req, "CONTRACTOR");
  if (authed instanceof Response) return authed;

  return NextResponse.json({
    ok: true,
    currentVersion: CONTRACTOR_TOS_VERSION,
  });
}

export async function POST(req: Request) {
  const authed = await requireV4Role(req, "CONTRACTOR");
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = AcceptTosSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "V4_INVALID_REQUEST", message: "Invalid input" } },
      { status: 400 },
    );
  }

  if (parsed.data.version !== CONTRACTOR_TOS_VERSION) {
    return NextResponse.json(
      { ok: false, error: { code: "V4_TOS_VERSION_MISMATCH", message: "Invalid TOS version" } },
      { status: 400 },
    );
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      tosVersion: CONTRACTOR_TOS_VERSION,
      acceptedTosAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, authed.userId));

  await recordRoleTermsAcceptance({
    userId: authed.userId,
    role: "CONTRACTOR",
    version: CONTRACTOR_TOS_VERSION,
    acceptedAt: now,
  });

  return NextResponse.json({ ok: true, version: CONTRACTOR_TOS_VERSION });
}

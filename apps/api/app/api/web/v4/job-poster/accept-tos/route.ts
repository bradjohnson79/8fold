import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { z } from "zod";

const AcceptTosSchema = z.object({
  accepted: z.literal(true),
  version: z.string().trim().min(1).max(20),
});

export async function POST(req: Request) {
  const authed = await requireV4Role(req, "JOB_POSTER");
  if (authed instanceof Response) return authed;

  const raw = await req.json().catch(() => null);
  const parsed = AcceptTosSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "V4_INVALID_REQUEST", message: "Invalid input" } },
      { status: 400 }
    );
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      tosVersion: parsed.data.version,
      acceptedTosAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, authed.userId));

  return NextResponse.json({ ok: true });
}

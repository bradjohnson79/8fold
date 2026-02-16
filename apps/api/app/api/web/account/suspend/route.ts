import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { users } from "../../../../../db/schema/user";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";

const BodySchema = z.object({
  months: z.union([z.literal(1), z.literal(3), z.literal(6)]),
});

function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const suspendUntil = addMonths(new Date(), parsed.data.months);

    await db
      .update(users)
      .set({
        accountStatus: "SUSPENDED",
        suspendedUntil: suspendUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.userId));

    return NextResponse.json(
      {
        ok: true,
        accountStatus: "SUSPENDED",
        suspendedUntil: suspendUntil.toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}


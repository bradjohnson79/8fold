import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/server/db/drizzle";
import { adminUsers } from "@/db/schema/adminUser";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(8),
  adminSecret: z.string().trim().min(8),
});

function forbidden() {
  return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return forbidden();

    const expected = String(process.env.ADMIN_SIGNUP_SECRET ?? "").trim();
    if (!expected || parsed.data.adminSecret !== expected) return forbidden();

    const email = parsed.data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    await db.insert(adminUsers).values({
      email,
      passwordHash,
      role: "ADMIN",
    } as any);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // Unique violations etc: never leak details; keep UX consistent.
    logEvent({
      level: "error",
      event: "admin.signup_error",
      route: "/api/admin/signup",
      method: "POST",
      status: 403,
      code: "FORBIDDEN",
    });
    return forbidden();
  }
}


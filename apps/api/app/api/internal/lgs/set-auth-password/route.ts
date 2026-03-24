/**
 * Protected endpoint to set (or reset) the LGS login password stored in the DB.
 *
 * Use when the bcrypt hash in lgs_worker_health is unknown or stale.
 * Requires: Authorization: Bearer <CRON_SECRET>
 * Body:     { "password": "your-new-password" }
 * Method:   POST
 */
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { db } from "@/server/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = (await req.json().catch(() => null)) as { password?: string } | null;
    const newPassword = String(body?.password ?? "").trim();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await db
      .insert(lgsWorkerHealth)
      .values({
        workerName: "lgs_auth",
        configCheckResult: { password_hash: hash },
      })
      .onConflictDoUpdate({
        target: lgsWorkerHealth.workerName,
        set: { configCheckResult: { password_hash: hash } },
      });

    console.info("[LGS_SET_AUTH_PASSWORD] Password updated in DB");

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can now log in with the new password.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS_SET_AUTH_PASSWORD] Failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

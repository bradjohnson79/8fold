/**
 * ONE-TIME USE — Reset LGS auth password.
 *
 * Clears any bcrypt-hashed password stored in lgs_worker_health,
 * forcing the login system to fall back to the LGS_AUTH_PASSWORD env var.
 *
 * Requires: Authorization: Bearer <CRON_SECRET>
 * Method:   POST
 */
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
    // Clear the stored bcrypt hash so login falls back to LGS_AUTH_PASSWORD env var
    await db
      .update(lgsWorkerHealth)
      .set({ configCheckResult: null })
      .where(eq(lgsWorkerHealth.workerName, "lgs_auth"));

    console.info("[LGS_RESET_AUTH] Password hash cleared — falling back to LGS_AUTH_PASSWORD env var");

    return NextResponse.json({
      ok: true,
      message: "Auth hash cleared. Login now uses LGS_AUTH_PASSWORD env var.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LGS_RESET_AUTH] Failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

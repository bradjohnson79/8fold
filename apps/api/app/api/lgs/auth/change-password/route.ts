import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { db } from "@/server/db/drizzle";
import { lgsWorkerHealth } from "@/db/schema/directoryEngine";
import { eq } from "drizzle-orm";

const AUTH_WORKER_NAME = "lgs_auth";

type AttemptBucket = { count: number; resetAt: number };
const changeAttemptsByIp = new Map<string, AttemptBucket>();

function consumeRateLimit(map: Map<string, AttemptBucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

async function verifyCurrentPassword(provided: string): Promise<boolean> {
  // Check DB hash first (set by a previous password change)
  const [row] = await db
    .select({ configCheckResult: lgsWorkerHealth.configCheckResult })
    .from(lgsWorkerHealth)
    .where(eq(lgsWorkerHealth.workerName, AUTH_WORKER_NAME))
    .limit(1);

  const config = row?.configCheckResult as Record<string, string> | null;
  if (config?.password_hash) {
    return bcrypt.compare(provided, config.password_hash);
  }

  // Fall back to env var (plain text)
  const envPassword = String(process.env.LGS_AUTH_PASSWORD ?? "").trim();
  return !!envPassword && provided === envPassword;
}

export async function POST(req: Request) {
  const ip = requestIp(req);

  if (!consumeRateLimit(changeAttemptsByIp, ip, 5, 60_000)) {
    return NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
      { status: 429 },
    );
  }

  try {
    const payload = (await req.json().catch(() => null)) as {
      currentPassword?: string;
      newPassword?: string;
    } | null;

    const currentPassword = String(payload?.currentPassword ?? "").trim();
    const newPassword = String(payload?.newPassword ?? "").trim();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "Current and new password are required" } },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "New password must be at least 8 characters" } },
        { status: 400 },
      );
    }

    const currentValid = await verifyCurrentPassword(currentPassword);
    if (!currentValid) {
      console.warn("[LGS_CHANGE_PASSWORD_DENIED]", { reason: "wrong_current_password", ip });
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Current password is incorrect" } },
        { status: 401 },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    // Upsert the new hash into lgs_worker_health under the auth row
    await db
      .insert(lgsWorkerHealth)
      .values({
        workerName: AUTH_WORKER_NAME,
        configCheckResult: { password_hash: newHash },
      })
      .onConflictDoUpdate({
        target: lgsWorkerHealth.workerName,
        set: { configCheckResult: { password_hash: newHash } },
      });

    console.info("[LGS_CHANGE_PASSWORD] Password updated successfully", { ip });
    return NextResponse.json({ ok: true, data: { changed: true } }, { status: 200 });
  } catch (error) {
    console.error("[LGS_CHANGE_PASSWORD_ERROR]", {
      ip,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to change password" } },
      { status: 500 },
    );
  }
}

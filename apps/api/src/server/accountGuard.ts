import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { users } from "../../db/schema/user";

async function ensureActiveAccountWithExecutor(
  exec: {
    select: typeof db.select;
    update: typeof db.update;
  },
  userId: string,
) {
  const rows = await exec.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0] ?? null;
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

  const accountStatus = String((user as any).accountStatus ?? "ACTIVE");

  if (accountStatus === "ARCHIVED") {
    throw Object.assign(new Error("Account archived"), { status: 403 });
  }

  if (accountStatus === "SUSPENDED") {
    const until: Date | null = (user as any).suspendedUntil ?? null;
    if (until && until > new Date()) {
      throw Object.assign(new Error("Account suspended"), { status: 403 });
    }
    // Auto-reactivate once suspension has expired.
    if (until && until <= new Date()) {
      await exec.update(users).set({ accountStatus: "ACTIVE", suspendedUntil: null }).where(eq(users.id, userId));
    }
  }
}

export async function ensureActiveAccount(userId: string) {
  return ensureActiveAccountWithExecutor(db, userId);
}

export async function ensureActiveAccountTx(tx: any, userId: string) {
  return ensureActiveAccountWithExecutor(tx, userId);
}


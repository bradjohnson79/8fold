import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { adminV4SessionTokenFromRequest, appendClearSessionCookie, sessionTokenHash } from "@/src/auth/adminV4Session";
import { ok } from "@/src/lib/api/adminV4Response";

export async function POST(req: Request) {
  const token = adminV4SessionTokenFromRequest(req);
  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.sessionTokenHash, sessionTokenHash(token))).catch(() => null);
  }
  const res = ok({ loggedOut: true });
  appendClearSessionCookie(res);
  return res;
}

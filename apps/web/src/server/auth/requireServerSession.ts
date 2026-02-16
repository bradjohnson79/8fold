import { cookies } from "next/headers";
import { requireSessionBySid, type Session } from "./requireSession";
import { SESSION_COOKIE_NAME } from "./session";

/**
 * Server-components-only session loader.
 *
 * Centralizes cookie reading so layouts/pages do not parse cookies manually.
 * Authorization is DB-authoritative via `requireSessionBySid()`.
 */
export async function requireServerSession(): Promise<Session | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  try {
    return await requireSessionBySid(sid);
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : null;
    if (status === 401) return null;
    throw err;
  }
}


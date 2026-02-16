import { requireSession, type Session } from "./requireSession";

function isAdminRole(roleRaw: string): boolean {
  const r = String(roleRaw ?? "").trim().toUpperCase();
  return r === "ADMIN";
}

export async function requireAdmin(req: Request): Promise<Session> {
  const session = await requireSession(req);
  if (!isAdminRole(session.role)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return session;
}


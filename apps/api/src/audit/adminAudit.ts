import crypto from "node:crypto";
import type { RequireAdminOk } from "../lib/auth/requireAdmin";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";

export type AdminAuditEntityType =
  | "User"
  | "Job"
  | "SupportTicket"
  | "DisputeCase"
  | "PayoutRequest"
  | "LedgerEntry"
  | "RouterContext"
  | "Unknown";

export type AdminAuditWrite = {
  action: string;
  entityType: AdminAuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
};

function safeHeaders(req: Request) {
  const h = req.headers;
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      null,
    userAgent: h.get("user-agent") || null,
    requestId:
      h.get("x-request-id") ||
      h.get("x-vercel-id") ||
      crypto.randomUUID(),
    referer: h.get("referer") || null,
  };
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Append-only admin audit writer.
 *
 * - Never throws (best-effort)
 * - Stores request meta in metadata to keep AuditLog schema stable.
 */
export async function adminAuditLog(
  req: Request,
  auth: RequireAdminOk,
  entry: AdminAuditWrite & { outcome?: "OK" | "ERROR"; error?: string },
): Promise<void> {
  try {
    const hdr = safeHeaders(req);
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: auth.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: {
        ...(entry.metadata ?? {}),
        _meta: {
          route: safePath(req.url),
          method: req.method,
          ip: hdr.ip,
          userAgent: hdr.userAgent,
          requestId: hdr.requestId,
          referer: hdr.referer,
          outcome: entry.outcome ?? "OK",
          error: entry.error ?? null,
        },
      } as any,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ADMIN_AUDIT_WRITE_FAILED]", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: err,
    });
  }
}


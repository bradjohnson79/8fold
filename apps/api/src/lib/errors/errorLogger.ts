import crypto from "node:crypto";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../../db/schema/auditLog";

function safeStr(x: unknown, max = 2000): string {
  const s = typeof x === "string" ? x : x instanceof Error ? x.message : JSON.stringify(x);
  return (s ?? "").slice(0, max);
}

export type ErrorLogInput = {
  context: string;
  err: unknown;
  meta?: Record<string, unknown>;
};

/**
 * Centralized server-side error logger (best-effort).
 *
 * Always logs to stderr. Also attempts to append an immutable AuditLog row
 * so ops can trace failures over time without relying on ephemeral console logs.
 *
 * Never throws.
 */
export function logApiError(input: ErrorLogInput): void {
  const stack = input.err instanceof Error ? input.err.stack : undefined;
  // eslint-disable-next-line no-console
  console.error("[API_ERROR]", {
    context: input.context,
    ...(input.meta ?? {}),
    error: input.err,
    stack,
  });

  // Best-effort append-only DB log (non-blocking).
  void (async () => {
    try {
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: null,
        action: "API_ERROR",
        entityType: "Route",
        entityId: input.context,
        metadata: {
          ...(input.meta ?? {}),
          message: safeStr(input.err),
          stack: stack ? safeStr(stack, 8000) : null,
        } as any,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[API_ERROR_DB_LOG_FAILED]", { context: input.context, error: e });
    }
  })();
}


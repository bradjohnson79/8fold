type DbAuditErrorShape = {
  ok: false;
  error: {
    code: string;
    message: string;
    hint?: string;
  };
  debug?: {
    fnName: string;
    sql?: string;
    params?: unknown[];
    postgres?: {
      code?: string;
      detail?: string;
      hint?: string;
      table?: string;
      column?: string;
      constraint?: string;
      schema?: string;
    };
  };
};

function auditEnabled(): boolean {
  return String(process.env.DB_AUDIT_LOG ?? "").trim() === "1";
}

function asAnyError(e: unknown): any {
  return e as any;
}

function tryExtractSqlAndParams(e: unknown): { sql?: string; params?: unknown[] } {
  const err = asAnyError(e);
  // Drizzle errors often carry `query` and `params` depending on driver.
  const sql =
    typeof err?.query === "string"
      ? err.query
      : typeof err?.sql === "string"
        ? err.sql
        : typeof err?.statement === "string"
          ? err.statement
          : undefined;
  const params = Array.isArray(err?.params) ? err.params : Array.isArray(err?.parameters) ? err.parameters : undefined;
  return { sql, params };
}

function toAuditShape(fnName: string, e: unknown): DbAuditErrorShape {
  const err = asAnyError(e);
  const msg = typeof err?.message === "string" ? err.message : String(e);
  const code = typeof err?.code === "string" ? err.code : "DB_ERROR";
  const hint = typeof err?.hint === "string" ? err.hint : undefined;

  const { sql, params } = tryExtractSqlAndParams(err);

  const postgres =
    typeof err === "object" && err
      ? {
          code: typeof err.code === "string" ? err.code : undefined,
          detail: typeof err.detail === "string" ? err.detail : undefined,
          hint: typeof err.hint === "string" ? err.hint : undefined,
          table: typeof err.table === "string" ? err.table : undefined,
          column: typeof err.column === "string" ? err.column : undefined,
          constraint: typeof err.constraint === "string" ? err.constraint : undefined,
          schema: typeof err.schema === "string" ? err.schema : undefined,
        }
      : undefined;

  return {
    ok: false,
    error: { code, message: msg, hint },
    debug: auditEnabled()
      ? {
          fnName,
          sql,
          params,
          postgres,
        }
      : undefined,
  };
}

/**
 * Audit-only DB wrapper.
 *
 * - No behavior changes when DB_AUDIT_LOG != 1
 * - When enabled, logs query details if available and rethrows with a standardized payload attached.
 */
export async function wrapDb<T>(fnName: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const shape = toAuditShape(fnName, e);
    if (auditEnabled()) {
      // eslint-disable-next-line no-console
      console.error("[DB_AUDIT]", JSON.stringify(shape, null, 2));
    }
    throw Object.assign(new Error(shape.error.message), {
      status: 500,
      code: shape.error.code,
      dbAudit: shape,
      cause: e,
    });
  }
}

export function dbAuditErrorResponse(e: unknown): DbAuditErrorShape | null {
  const err = asAnyError(e);
  const shape = err?.dbAudit;
  if (shape && shape.ok === false && shape.error && typeof shape.error.message === "string") return shape as DbAuditErrorShape;
  return null;
}


/**
 * Maps database/Postgres error codes to structured API error codes.
 * Used for production-safe error classification without exposing internal details.
 *
 * Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export type ApiErrorCode =
  | "conflict_error"
  | "invalid_reference"
  | "invalid_state_transition"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "internal_error";

export function mapErrorCode(err: unknown): ApiErrorCode {
  const e = err as { code?: string; status?: number; message?: string };
  const code = typeof e?.code === "string" ? e.code : null;
  const status = typeof e?.status === "number" ? e.status : null;
  const msg = typeof e?.message === "string" ? e.message : "";

  if (status === 401 || /unauthorized/i.test(msg)) return "unauthorized";
  if (status === 403 || /forbidden/i.test(msg)) return "forbidden";

  switch (code) {
    case "23505":
      return "conflict_error"; // unique_violation
    case "23503":
      return "invalid_reference"; // foreign_key_violation
    case "22P02":
    case "22P05":
      return "invalid_state_transition"; // invalid_text_representation, invalid_parameter_value (e.g. enum)
    case "02000":
    case "P0002":
      return "not_found"; // no_data_found, no_data
    default:
      return "internal_error";
  }
}

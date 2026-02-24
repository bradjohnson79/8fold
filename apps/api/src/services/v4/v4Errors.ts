export class V4Error extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(code: string, message: string, status: number, details?: any) {
    super(message);
    this.name = "V4Error";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: any): V4Error {
  return new V4Error(code, message, 400, details);
}

export function unauthorized(code: string, message = "Unauthorized"): V4Error {
  return new V4Error(code, message, 401);
}

export function forbidden(code: string, message = "Forbidden"): V4Error {
  return new V4Error(code, message, 403);
}

export function conflict(code: string, message: string, details?: any): V4Error {
  return new V4Error(code, message, 409, details);
}

export function tooMany(code: string, message: string, retryAfterSeconds: number): V4Error {
  return new V4Error(code, message, 429, { retryAfterSeconds });
}

export function internal(code: string, message = "Internal server error"): V4Error {
  return new V4Error(code, message, 500);
}

export function toV4ErrorResponse(err: unknown, requestId?: string) {
  const wrapped = err instanceof V4Error ? err : internal("V4_INTERNAL_ERROR");
  return {
    ok: false as const,
    error: {
      code: wrapped.code,
      message: wrapped.message,
      ...(wrapped.details ? { details: wrapped.details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  };
}

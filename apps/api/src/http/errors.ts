export function toHttpError(err: unknown): { status: number; message: string; code: string; context?: unknown } {
  if (err && typeof err === "object") {
    const anyErr = err as { status?: unknown; message?: unknown; error?: unknown; code?: unknown; context?: unknown };
    const status =
      typeof anyErr.status === "number" && Number.isFinite(anyErr.status)
        ? anyErr.status
        : 500;
    const message =
      typeof anyErr.message === "string" && anyErr.message.length > 0
        ? anyErr.message
        : typeof anyErr.error === "string" && anyErr.error.length > 0
          ? anyErr.error
        : "Internal Server Error";
    const codeRaw = typeof anyErr.code === "string" ? anyErr.code.trim() : "";
    const code =
      codeRaw ||
      (status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status >= 400 && status < 500
              ? "BAD_REQUEST"
              : "INTERNAL_ERROR");
    return { status, message, code, context: anyErr.context };
  }
  return { status: 500, message: "Internal Server Error", code: "INTERNAL_ERROR" };
}


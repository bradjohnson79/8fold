/**
 * Returns a production-safe error message for client responses.
 * Never leaks stack traces or internal details in production.
 */
export function safeErrorMessage(err: unknown, status: number): string {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    switch (status) {
      case 500:
        return "Server error";
      case 401:
        return "Unauthorized";
      case 403:
        return "Forbidden";
      case 404:
        return "Not found";
      case 409:
        return "Conflict";
      case 400:
        return "Bad request";
      default:
        return status >= 500 ? "Server error" : "Request failed";
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  const trimmed = (msg ?? "").trim().slice(0, 500);
  return trimmed || "Request failed";
}

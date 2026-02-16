export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  level: LogLevel;
  event: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  role?: string;
  code?: string;
  context?: unknown;
};

function sanitize(obj: any): any {
  // Avoid logging huge/circular objects by accident.
  if (!obj || typeof obj !== "object") return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return "[unserializable]";
  }
}

export function logEvent(e: LogEvent) {
  const payload = {
    ts: new Date().toISOString(),
    ...e,
    context: e.context === undefined ? undefined : sanitize(e.context),
  };
  const line = JSON.stringify(payload);
  if (e.level === "error") console.error(line);
  else if (e.level === "warn") console.warn(line);
  else console.log(line);
}


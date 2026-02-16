export class ApiRouteError extends Error {
  status: number;
  code: string;
  meta?: Record<string, unknown>;

  constructor(status: number, code: string, message?: string, meta?: Record<string, unknown>) {
    super(message ?? code);
    this.name = "ApiRouteError";
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

export function isApiRouteError(err: unknown): err is ApiRouteError {
  return (
    !!err &&
    typeof err === "object" &&
    (err as any).name === "ApiRouteError" &&
    typeof (err as any).status === "number" &&
    typeof (err as any).code === "string"
  );
}


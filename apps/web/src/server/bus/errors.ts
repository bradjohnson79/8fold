type BusErrorOptions = {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
  expose?: boolean;
  cause?: unknown;
};

/**
 * Base error type for the Rome bus.
 *
 * - `status`: suggested HTTP status for route handlers
 * - `expose`: whether the message is safe to return to the client
 */
export class BusError extends Error {
  code: string;
  status: number;
  requestId?: string;
  expose: boolean;
  override cause?: unknown;

  constructor(opts: BusErrorOptions) {
    super(opts.message);
    this.name = "BusError";
    this.code = opts.code;
    this.status = opts.status ?? 500;
    this.requestId = opts.requestId;
    this.expose = opts.expose ?? false;
    this.cause = opts.cause;
  }
}

export class InvalidCommandError extends BusError {
  constructor(message: string, requestId?: string) {
    super({ code: "INVALID_COMMAND", message, status: 400, expose: true, requestId });
    this.name = "InvalidCommandError";
  }
}

export class UnknownCommandError extends BusError {
  constructor(type: string, requestId?: string) {
    super({
      code: "UNKNOWN_COMMAND",
      message: `Unknown command type: ${type}`,
      status: 404,
      expose: true,
      requestId,
    });
    this.name = "UnknownCommandError";
  }
}

export class HandlerFailedError extends BusError {
  constructor(type: string, requestId?: string, cause?: unknown) {
    super({
      code: "HANDLER_FAILED",
      message: `Command handler failed: ${type}`,
      status: 500,
      expose: false,
      requestId,
      cause,
    });
    this.name = "HandlerFailedError";
  }
}


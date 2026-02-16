import { BusError, HandlerFailedError, InvalidCommandError, UnknownCommandError } from "./errors";
import type { Command, Handler } from "./types";

type AnyHandler = Handler<any, any>;

function isBusErrorLike(err: unknown): err is BusError {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return (
    anyErr instanceof BusError ||
    (typeof anyErr.code === "string" &&
      typeof anyErr.status === "number" &&
      typeof anyErr.message === "string" &&
      // best-effort: preserve intentional errors even if module identity differs
      (anyErr.name === "BusError" || anyErr.expose === true || anyErr.expose === false))
  );
}

/**
 * Rome command bus.
 *
 * - Route handlers should be thin: parse -> requireSession -> dispatch
 * - Business logic lives in handlers registered by `command.type`
 */
export class Bus {
  private handlers = new Map<string, AnyHandler>();

  register<TType extends string, TPayload, TResult>(
    type: TType,
    handler: Handler<TPayload, TResult>
  ): void {
    if (!type || typeof type !== "string") {
      throw new InvalidCommandError("Command type must be a non-empty string");
    }
    if (this.handlers.has(type)) {
      throw new InvalidCommandError(`Handler already registered for: ${type}`);
    }
    this.handlers.set(type, handler as AnyHandler);
  }

  async dispatch<TType extends string, TPayload, TResult>(
    command: Command<TType, TPayload>
  ): Promise<TResult> {
    const requestId = command?.context?.requestId;
    const type = command?.type;

    if (!type || typeof type !== "string") {
      throw new InvalidCommandError("Missing command.type", requestId);
    }
    if (!command?.context || !command.context.requestId || !command.context.now) {
      throw new InvalidCommandError("Missing command.context (requestId/now required)", requestId);
    }

    const handler = this.handlers.get(type) as AnyHandler | undefined;
    if (!handler) throw new UnknownCommandError(type, requestId);

    try {
      return (await handler({ payload: command.payload, context: command.context })) as TResult;
    } catch (err) {
      if (isBusErrorLike(err)) throw err;
      // Log once with requestId; do not expose internal stack in response.
      throw new HandlerFailedError(type, requestId, err);
    }
  }
}

/**
 * Default bus singleton (handlers register into this at module init).
 */
const BUS_KEY = "__ROME_COMMAND_BUS__";
export const bus: Bus = ((globalThis as any)[BUS_KEY] as Bus | undefined) ?? new Bus();
if (!(globalThis as any)[BUS_KEY]) {
  (globalThis as any)[BUS_KEY] = bus;
}


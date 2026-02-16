export type CommandContext = {
  /**
   * Correlation id shared across route -> bus -> downstream.
   * Route handlers should generate this once per request.
   */
  requestId: string;

  /**
   * Capture a single timestamp at the edge of the request.
   * Business logic should prefer this over calling `new Date()` repeatedly.
   */
  now: Date;

  /**
   * Session/actor info (populated by route handler after requireSession()).
   * Keep this minimal; expand only as needed.
   */
  session?: {
    userId: string;
    role?: string | null;
  } | null;

  /**
   * Session token (sid) when available.
   * Used for proxying authenticated commands to apps/api.
   */
  sessionToken?: string | null;

  ip?: string | null;
  userAgent?: string | null;
};

export type Command<TType extends string = string, TPayload = unknown> = {
  type: TType;
  payload: TPayload;
  context: CommandContext;
};

export type Handler<TPayload = unknown, TResult = unknown> = (args: {
  payload: TPayload;
  context: CommandContext;
}) => Promise<TResult> | TResult;


/**
 * DB guardrail (apps/web)
 *
 * apps/web must not construct a DB client or call Drizzle.
 * All DB access must live in apps/api, and apps/web must call HTTP APIs instead.
 */

export const db: never = new Proxy(
  {},
  {
    get() {
      throw new Error("DB access is not allowed in apps/web. Call apps/api over HTTP instead.");
    },
  },
) as never;


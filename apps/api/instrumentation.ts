/**
 * Next.js instrumentation — runs once when the server starts, before handling requests.
 * Runs schema capability verification so drift is detected before any requests are served.
 * Schedules the event outbox worker to process domain events asynchronously.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkSchemaCapabilities } = await import("@/src/startup/checkSchemaCapabilities");
  await import("@/db/drizzle"); // Ensure pool is initialized
  await checkSchemaCapabilities();

  const { processEventOutbox } = await import("@/src/events/processEventOutbox");
  setInterval(processEventOutbox, 5000);
}

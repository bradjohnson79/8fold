/**
 * Hard lock: seed scripts must never run in production.
 *
 * Call this at the top of any seed/e2e script before touching the DB.
 */
export function assertNotProductionSeed(scriptName: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `❌ Refusing to run seed script in production (NODE_ENV=production): ${scriptName}`,
    );
  }
}


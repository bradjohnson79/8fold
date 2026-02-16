/**
 * DEVELOPMENT_MOCKS env: when false, seed scripts and bulk AI test jobs must not create mock data.
 * Prevents polluting production/staging with mock contractors, routers, or auto-assigned jobs.
 */
export function isDevelopmentMocksEnabled(): boolean {
  return process.env.DEVELOPMENT_MOCKS === "true" || process.env.DEVELOPMENT_MOCKS === "1";
}

export function assertDevelopmentMocksEnabled(context: string): void {
  if (!isDevelopmentMocksEnabled()) {
    throw new Error(
      `${context} requires DEVELOPMENT_MOCKS=true. Set in .env to create mock contractors, routers, or bulk AI test jobs.`
    );
  }
}

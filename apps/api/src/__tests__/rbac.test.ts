import { describe, expect, test, vi } from "vitest";

// Ensure Drizzle client can load in test environment (no live DB required for these cases).
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/postgres?schema=app";

async function loadRbac() {
  return await import("../auth/rbac");
}

describe("RBAC guards (session-based)", () => {
  test("optionalUser returns null if no token", async () => {
    const { optionalUser } = await loadRbac();
    const req = new Request("http://local", { headers: {} });
    const u = await optionalUser(req);
    expect(u).toBeNull();
  });

  test("requireUser throws 401 if no token", async () => {
    const { requireUser } = await loadRbac();
    const req = new Request("http://local", { headers: {} });
    await expect(() => requireUser(req)).rejects.toMatchObject({ status: 401 });
  });

  test("requireAdmin throws 401 if no token", async () => {
    const { requireAdmin } = await loadRbac();
    const req = new Request("http://local", { headers: {} });
    await expect(() => requireAdmin(req)).rejects.toMatchObject({ status: 401 });
  });
});


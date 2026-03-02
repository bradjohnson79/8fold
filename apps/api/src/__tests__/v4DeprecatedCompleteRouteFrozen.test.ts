import { describe, expect, test } from "vitest";

describe("deprecated v4 complete route is frozen", () => {
  test("POST returns 410 LEGACY_ROUTE_FROZEN", async () => {
    const mod = await import("../../app/api/web/v4/contractor/jobs/[jobId]/complete/route");
    const resp = await mod.POST();
    expect(resp.status).toBe(410);
    const body = (await resp.json()) as { ok?: boolean; code?: string; message?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("LEGACY_ROUTE_FROZEN");
    expect(String(body.message ?? "")).toContain("mark-complete");
  });
});

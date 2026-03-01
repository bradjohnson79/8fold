import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();

vi.mock("@/server/db/drizzle", () => ({
  db: {
    execute: executeMock,
  },
}));

describe("system health runtime routes", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("GET /api/health/noop returns a fast noop payload", async () => {
    const { GET } = await import("@/app/api/health/noop/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      noop: true,
      service: "apps-api",
    });
  });

  it("GET /api/system/health returns connected when DB ping succeeds", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const { GET } = await import("@/app/api/system/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("connected");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("GET /api/system/users/count returns user totals", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ count: "7" }] });
    const { GET } = await import("@/app/api/system/users/count/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      users: { total: 7 },
    });
  });

  it("GET /api/system/health returns failure payload when DB ping throws", async () => {
    executeMock.mockRejectedValueOnce(new Error("db unavailable"));
    const { GET } = await import("@/app/api/system/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.db).toBe("error");
  });
});

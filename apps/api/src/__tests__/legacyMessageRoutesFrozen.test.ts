import { describe, expect, test } from "vitest";

type RouteModule = {
  GET?: (req: Request, ctx?: unknown) => Promise<Response>;
  POST?: (req: Request, ctx?: unknown) => Promise<Response>;
};

const cases: Array<{ name: string; load: () => Promise<RouteModule>; expectedRoute: string }> = [
  {
    name: "contractor conversations",
    load: () => import("../../app/api/web/contractor/conversations/route"),
    expectedRoute: "/api/web/v4/contractor/messages/threads",
  },
  {
    name: "contractor conversation messages",
    load: () => import("../../app/api/web/contractor/conversations/[id]/messages/route"),
    expectedRoute: "/api/web/v4/contractor/messages/thread/{threadId}",
  },
  {
    name: "job-poster conversations",
    load: () => import("../../app/api/web/job-poster/conversations/route"),
    expectedRoute: "/api/web/v4/job-poster/messages/threads",
  },
  {
    name: "job-poster conversation messages",
    load: () => import("../../app/api/web/job-poster/conversations/[id]/messages/route"),
    expectedRoute: "/api/web/v4/job-poster/messages/thread/{threadId}",
  },
  {
    name: "generic v4 threads alias",
    load: () => import("../../app/api/web/v4/messages/threads/route"),
    expectedRoute: "/api/web/v4/{role}/messages/threads",
  },
  {
    name: "generic v4 thread alias",
    load: () => import("../../app/api/web/v4/messages/thread/[threadId]/route"),
    expectedRoute: "/api/web/v4/{role}/messages/thread/{threadId}",
  },
  {
    name: "generic v4 thread send alias",
    load: () => import("../../app/api/web/v4/messages/thread/[threadId]/send/route"),
    expectedRoute: "/api/web/v4/{role}/messages/thread/{threadId}/send",
  },
];

async function assertFrozen(resp: Response, expectedRoute: string) {
  expect(resp.status).toBe(410);
  const json = (await resp.json()) as { ok?: boolean; code?: string; message?: string };
  expect(json.ok).toBe(false);
  expect(json.code).toBe("LEGACY_ROUTE_FROZEN");
  expect(String(json.message ?? "")).toContain(expectedRoute);
}

describe("legacy message routes are frozen", () => {
  for (const c of cases) {
    test(`GET ${c.name} returns 410 freeze contract`, async () => {
      const mod = await c.load();
      expect(typeof mod.GET).toBe("function");
      const resp = await mod.GET!(new Request("http://localhost/test"));
      await assertFrozen(resp, c.expectedRoute);
    });

    test(`POST ${c.name} returns 410 freeze contract`, async () => {
      const mod = await c.load();
      expect(typeof mod.POST).toBe("function");
      const resp = await mod.POST!(new Request("http://localhost/test", { method: "POST" }));
      await assertFrozen(resp, c.expectedRoute);
    });
  }
});

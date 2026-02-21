import { expect, test } from "@playwright/test";
import { E2E_USER, getJson, resetFixture } from "./helpers";

test.use({ extraHTTPHeaders: { "x-e2e-user": E2E_USER } });

test("advance rejects invalid transition with 409", async ({ page, request }) => {
  await resetFixture(request);
  await page.goto("/e2e/job-wizard");

  const current = await getJson(request, "/api/app/job-poster/drafts-v2/current");
  expect(current.res.status()).toBe(200);

  const reqPromise = page.waitForRequest((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/advance") && r.method() === "POST"
  );
  const evalPromise = page.evaluate(async ({ draftId, expectedVersion }) => {
    const resp = await fetch("/api/app/job-poster/drafts-v2/advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        expectedVersion,
        targetStep: "CONFIRMED",
      }),
    });
    return { status: resp.status, body: await resp.json() };
  }, {
    draftId: current.json?.draft?.id,
    expectedVersion: current.json?.draft?.version,
  });
  const req = await reqPromise;
  const reqBody = JSON.parse(req.postData() ?? "{}");
  const out = await evalPromise;

  expect(typeof reqBody.expectedVersion).toBe("number");
  expect(reqBody.targetStep).toBe("CONFIRMED");
  expect(out.status).toBe(409);
  expect(out.body.code).toBe("STEP_INVALID");
});

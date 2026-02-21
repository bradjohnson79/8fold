import { expect, test } from "@playwright/test";
import { E2E_USER, getJson, postJson, resetFixture, seedPricingFixture } from "./helpers";

test.use({ extraHTTPHeaders: { "x-e2e-user": E2E_USER } });

test("create-payment-intent enforces PRICING step and is idempotent", async ({ page, request }) => {
  await resetFixture(request);
  await page.goto("/e2e/job-wizard");

  const currentDefault = await getJson(request, "/api/app/job-poster/drafts-v2/current");
  expect(currentDefault.res.status()).toBe(200);
  expect(currentDefault.json?.draft?.currentStep).toBe("DETAILS");

  const blocked = await postJson(request, "/api/app/job-poster/drafts-v2/create-payment-intent", {
    draftId: currentDefault.json?.draft?.id,
    expectedVersion: currentDefault.json?.draft?.version,
  });
  expect(blocked.res.status()).toBe(409);
  expect(blocked.json?.code).toBe("STEP_INVALID");

  const seeded = await seedPricingFixture(request);

  const reqPromise = page.waitForRequest((r) =>
    r.url().includes("/api/app/job-poster/drafts-v2/create-payment-intent") && r.method() === "POST"
  );
  const first = await page.evaluate(async ({ draftId, expectedVersion }) => {
    const resp = await fetch("/api/app/job-poster/drafts-v2/create-payment-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, expectedVersion }),
    });
    return { status: resp.status, body: await resp.json() };
  }, { draftId: seeded.id, expectedVersion: seeded.version });
  const req = await reqPromise;
  const reqBody = JSON.parse(req.postData() ?? "{}");
  expect(typeof reqBody.expectedVersion).toBe("number");
  expect(first.status).toBe(200);
  expect(first.body.success).toBe(true);
  const firstSecret = String(first.body.clientSecret);

  const afterFirst = await getJson(request, "/api/app/job-poster/drafts-v2/current");
  expect(afterFirst.res.status()).toBe(200);
  const versionAfterFirst = Number(afterFirst.json?.draft?.version);

  const second = await postJson(request, "/api/app/job-poster/drafts-v2/create-payment-intent", {
    draftId: seeded.id,
    expectedVersion: seeded.version,
  });
  expect(second.res.status()).toBe(200);
  expect(second.json?.success).toBe(true);
  expect(second.json?.clientSecret).toBe(firstSecret);

  const afterSecond = await getJson(request, "/api/app/job-poster/drafts-v2/current");
  expect(afterSecond.res.status()).toBe(200);
  expect(Number(afterSecond.json?.draft?.version)).toBe(versionAfterFirst);
});

import { expect, test } from "@playwright/test";
import { E2E_USER, postJson, resetFixture, seedPricingFixture } from "./helpers";

test.use({ extraHTTPHeaders: { "x-e2e-user": E2E_USER } });

test("verify-payment returns idempotent true on second call", async ({ request }) => {
  await resetFixture(request);
  const seeded = await seedPricingFixture(request);

  const funded = await postJson(request, "/api/e2e/job-wizard/fund", {});
  expect(funded.res.status()).toBe(200);
  expect(funded.json?.success).toBe(true);
  const paymentIntentId = String(funded.json?.paymentIntentId ?? `pi_${seeded.id}`);

  const firstVerify = await postJson(request, "/api/app/job-poster/drafts-v2/verify-payment", {
    paymentIntentId,
  });
  expect(firstVerify.res.status()).toBe(200);
  expect(firstVerify.json?.success).toBe(true);
  expect(firstVerify.json?.idempotent).toBe(false);

  const secondVerify = await postJson(request, "/api/app/job-poster/drafts-v2/verify-payment", {
    paymentIntentId,
  });
  expect(secondVerify.res.status()).toBe(200);
  expect(secondVerify.json?.success).toBe(true);
  expect(secondVerify.json?.idempotent).toBe(true);
});

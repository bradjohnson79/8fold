import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const E2E_USER = "poster_test";

export async function postJson(request: APIRequestContext, path: string, data?: unknown) {
  const res = await request.post(path, {
    headers: { "x-e2e-user": E2E_USER, "content-type": "application/json" },
    data: data ?? {},
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export async function getJson(request: APIRequestContext, path: string) {
  const res = await request.get(path, {
    headers: { "x-e2e-user": E2E_USER },
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export async function resetFixture(request: APIRequestContext) {
  const out = await postJson(request, "/api/e2e/job-wizard/reset", {});
  expect(out.res.status()).toBe(200);
  expect(out.json?.success).toBe(true);
}

export async function seedPricingFixture(request: APIRequestContext) {
  const out = await postJson(request, "/api/e2e/job-wizard/seed", {});
  expect(out.res.status()).toBe(200);
  expect(out.json?.success).toBe(true);
  return out.json?.draft as { id: string; version: number; currentStep: string };
}

export async function parseVersionFromWizard(page: Page): Promise<number> {
  const text = await page.locator("p", { hasText: "Step:" }).first().innerText();
  const match = text.match(/\(v(\d+)\)/);
  if (!match) throw new Error(`Version not found in text: ${text}`);
  return Number(match[1]);
}

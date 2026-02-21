import { expect, test } from "@playwright/test";

const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:3006";
const TOKEN = process.env.E2E_BEARER_TOKEN || "";

test("job-post-v3 API happy path", async ({ request }) => {
  test.skip(!TOKEN, "Set E2E_BEARER_TOKEN to run this smoke test.");

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  const getResp = await request.get(`${BASE_URL}/api/job-draft`, { headers });
  expect(getResp.ok()).toBeTruthy();
  const getJson = await getResp.json();
  expect(getJson.success).toBeTruthy();

  const patchResp = await request.patch(`${BASE_URL}/api/job-draft`, {
    headers,
    data: {
      dataPatch: {
        details: {
          title: "V3 Smoke Job",
          category: "HANDYMAN",
          description: "Test job description",
          region: "BC",
          stateCode: "BC",
          countryCode: "CA",
          city: "Langley",
          isRegional: true,
        },
      },
    },
  });
  expect(patchResp.ok()).toBeTruthy();

  const appraisalResp = await request.post(`${BASE_URL}/api/job-draft/appraise`, { headers });
  expect(appraisalResp.ok()).toBeTruthy();

  const piResp = await request.post(`${BASE_URL}/api/job-draft/payment-intent`, {
    headers,
    data: { selectedPrice: 10000, isRegional: true },
  });
  expect(piResp.ok()).toBeTruthy();
});

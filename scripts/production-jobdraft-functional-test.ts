/**
 * Production JobDraft Functional Test
 * Run: API_ORIGIN=https://api.8fold.app [E2E_BEARER_TOKEN=...] pnpm exec tsx scripts/production-jobdraft-functional-test.ts
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "https://api.8fold.app").replace(/\/+$/, "");
const TOKEN = process.env.E2E_BEARER_TOKEN ?? "";

const report: {
  endpoint_reachable: boolean;
  status_code: number;
  json_valid: boolean;
  draft_status: string | null;
  error_stack: string | null;
} = {
  endpoint_reachable: false,
  status_code: -1,
  json_valid: false,
  draft_status: null,
  error_stack: null,
};

async function main() {
  console.log("=== Production JobDraft Functional Test ===\n");
  console.log("STEP 1 — API Origin");
  console.log("  API_ORIGIN:", API_ORIGIN);
  const expected = "https://api.8fold.app";
  if (API_ORIGIN !== expected) {
    console.log("  ⚠ Expected:", expected);
  } else {
    console.log("  ✅ Matches expected production value");
  }

  const url = `${API_ORIGIN}/api/job-draft`;
  console.log("\nSTEP 2 — GET", url);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      credentials: "omit",
    });

    report.status_code = res.status;
    report.endpoint_reachable = res.status < 500 && res.status !== 0;

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
      report.json_valid = true;
    } catch {
      report.json_valid = false;
    }

    if (report.json_valid && json && typeof json === "object" && "draft" in json) {
      const d = (json as { draft?: { status?: string } }).draft;
      report.draft_status = d?.status ?? null;
    }

    console.log("  Status:", res.status);
    console.log("  JSON valid:", report.json_valid);
    if (report.draft_status) console.log("  draft.status:", report.draft_status);
    if (res.status >= 400) {
      console.log("  Body:", text.slice(0, 500));
    }
  } catch (err) {
    report.error_stack = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error("  Error:", report.error_stack);
  }

  console.log("\n--- FINAL REPORT ---");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);

import assert from "node:assert/strict";
import { isSameJurisdiction } from "../apps/api/src/jurisdiction";

type Jurisdiction = { countryCode: string; stateCode: string };

function passesJurisdiction(job: Jurisdiction, actor: Jurisdiction): boolean {
  return isSameJurisdiction(job.countryCode, job.stateCode, actor.countryCode, actor.stateCode);
}

function evaluateRoutingCandidate(job: Jurisdiction, actor: Jurisdiction, computeDistanceKm: () => number): boolean {
  if (!passesJurisdiction(job, actor)) return false;
  return computeDistanceKm() <= 100;
}

function run(): void {
  const cases = [
    { name: "BC job + BC router -> allowed", job: { countryCode: "CA", stateCode: "BC" }, actor: { countryCode: "CA", stateCode: "BC" }, expected: true },
    { name: "BC job + AB router -> blocked", job: { countryCode: "CA", stateCode: "BC" }, actor: { countryCode: "CA", stateCode: "AB" }, expected: false },
    { name: "BC job + WA contractor -> blocked", job: { countryCode: "CA", stateCode: "BC" }, actor: { countryCode: "US", stateCode: "WA" }, expected: false },
    { name: "WA job + WA router -> allowed", job: { countryCode: "US", stateCode: "WA" }, actor: { countryCode: "US", stateCode: "WA" }, expected: true },
    { name: "WA job + OR contractor -> blocked", job: { countryCode: "US", stateCode: "WA" }, actor: { countryCode: "US", stateCode: "OR" }, expected: false },
  ] as const;

  for (const tc of cases) {
    let distanceCalls = 0;
    const result = evaluateRoutingCandidate(tc.job, tc.actor, () => {
      distanceCalls += 1;
      return 10;
    });
    assert.equal(result, tc.expected, `${tc.name}: expected ${tc.expected ? "allowed" : "blocked"}`);
    assert.equal(distanceCalls, tc.expected ? 1 : 0, `${tc.name}: distance gating order failed`);
  }

  console.log("Jurisdiction containment matrix passed.");
}

run();

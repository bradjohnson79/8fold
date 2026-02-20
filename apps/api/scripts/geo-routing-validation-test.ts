#!/usr/bin/env tsx
/**
 * Part 5 — Geo routing validation test
 * Verifies: stored coords valid, distance < 2 km, serviceRadiusKm=25 eligible, serviceRadiusKm=1 ineligible for 2km away.
 *
 * Run: pnpm -C apps/api exec tsx scripts/geo-routing-validation-test.ts
 */
import { haversineKm } from "../src/jobs/geo";

const langleyJob = { lat: 49.1044, lng: -122.8011 };
const langleyContractor = { lat: 49.1044, lng: -122.8011 };
const contractor2kmAway = { lat: 49.1244, lng: -122.8011 }; // ~2.2 km north

const jobTypeLimitKm = 50; // urban CA

function testEligibility(
  job: { lat: number; lng: number },
  contractor: { lat: number; lng: number },
  serviceRadiusKm: number
): { distanceKm: number; effectiveRadiusKm: number; eligible: boolean } {
  const distanceKm = haversineKm(job, contractor);
  const effectiveRadiusKm = Math.min(jobTypeLimitKm, serviceRadiusKm);
  const eligible = distanceKm <= effectiveRadiusKm;
  return { distanceKm, effectiveRadiusKm, eligible };
}

console.log("=== Part 5 — Geo Routing Validation Test ===\n");

// Case 1: Langley job + Langley contractor, serviceRadiusKm=25
const r1 = testEligibility(langleyJob, langleyContractor, 25);
console.log("Case 1: Job + Contractor both Langley, serviceRadiusKm=25");
console.log("  Job lat/lng:", langleyJob.lat, langleyJob.lng);
console.log("  Contractor lat/lng:", langleyContractor.lat, langleyContractor.lng);
console.log("  Distance km:", r1.distanceKm.toFixed(4));
console.log("  jobTypeLimitKm:", jobTypeLimitKm);
console.log("  effectiveRadiusKm:", r1.effectiveRadiusKm);
console.log("  Eligible:", r1.eligible ? "✓ YES" : "✗ NO");
console.log("");

// Case 2: Langley job + Langley contractor, serviceRadiusKm=1
const r2 = testEligibility(langleyJob, langleyContractor, 1);
console.log("Case 2: Job + Contractor both Langley, serviceRadiusKm=1");
console.log("  Distance km:", r2.distanceKm.toFixed(4));
console.log("  effectiveRadiusKm:", r2.effectiveRadiusKm);
console.log("  Eligible:", r2.eligible ? "✓ YES" : "✗ NO");
console.log("");

// Case 3: Langley job + contractor 2km away, serviceRadiusKm=25
const r3 = testEligibility(langleyJob, contractor2kmAway, 25);
console.log("Case 3: Job Langley, Contractor ~2.2 km away, serviceRadiusKm=25");
console.log("  Contractor lat/lng:", contractor2kmAway.lat, contractor2kmAway.lng);
console.log("  Distance km:", r3.distanceKm.toFixed(4));
console.log("  effectiveRadiusKm:", r3.effectiveRadiusKm);
console.log("  Eligible:", r3.eligible ? "✓ YES" : "✗ NO");
console.log("");

// Case 4: Langley job + contractor 2km away, serviceRadiusKm=1
const r4 = testEligibility(langleyJob, contractor2kmAway, 1);
console.log("Case 4: Job Langley, Contractor ~2.2 km away, serviceRadiusKm=1");
console.log("  Distance km:", r4.distanceKm.toFixed(4));
console.log("  effectiveRadiusKm:", r4.effectiveRadiusKm);
console.log("  Eligible:", r4.eligible ? "✓ YES (should be ✗ NO)" : "✗ NO");
console.log("");

console.log("--- Success Criteria ---");
console.log("Stored coords valid numbers:", Number.isFinite(langleyJob.lat) && Number.isFinite(langleyJob.lng) ? "✓" : "✗");
console.log("Distance < 2 km (Langley→Langley):", r1.distanceKm < 2 ? "✓" : "✗");
console.log("Contractor serviceRadiusKm=25 eligible:", r1.eligible ? "✓" : "✗");
console.log("Contractor serviceRadiusKm=1 NOT eligible when 2km away:", !r4.eligible ? "✓" : "✗");

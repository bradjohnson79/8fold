#!/usr/bin/env tsx
/**
 * Part 4 — Temporary debug: verify distance for Langley → Langley
 * Two Langley, BC addresses within ~2 km should yield 0.5–2.0 km.
 *
 * Run: pnpm -C apps/api exec tsx scripts/audit-distance-langley.ts
 */
import { haversineKm } from "../src/jobs/geo";

// Langley, BC coords from seed scripts
const langleyA = { lat: 49.1044, lng: -122.8011 }; // 20000 64 Ave area (seed-audit)
const langleySame = { lat: 49.1044, lng: -122.8011 }; // Same point (job + contractor both Langley)
// ~1 km apart: 0.01° lat ≈ 1.1 km at this latitude
const langleyNearby = { lat: 49.1144, lng: -122.8011 };

const kmSame = haversineKm(langleyA, langleySame);
const kmNearby = haversineKm(langleyA, langleyNearby);

console.log("JOB COORDS:", langleyA.lat, langleyA.lng);
console.log("CONTRACTOR COORDS (same):", langleySame.lat, langleySame.lng);
console.log("DISTANCE KM (same point):", kmSame);

console.log("\nJOB COORDS:", langleyA.lat, langleyA.lng);
console.log("CONTRACTOR COORDS (~1 km away):", langleyNearby.lat, langleyNearby.lng);
console.log("DISTANCE KM:", kmNearby);

console.log("\n--- Part 4 Expected ---");
console.log("Same point (0 km):", kmSame === 0 ? "✓ PASS" : "✗ FAIL");
console.log("Distance 0.5–2.0 km for nearby Langley:", kmNearby >= 0.5 && kmNearby <= 2.0 ? "✓ PASS" : `✗ (got ${kmNearby.toFixed(2)} km)`);

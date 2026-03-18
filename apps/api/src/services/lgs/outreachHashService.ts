/**
 * LGS Outreach: Normalize body and compute SHA256 hash for uniqueness.
 * Prevents GPT cosmetic differences from bypassing the uniqueness guard.
 */
import crypto from "node:crypto";

export function normalizeBody(body: string): string {
  return body
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeBodyHash(body: string): string {
  const normalized = normalizeBody(body);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

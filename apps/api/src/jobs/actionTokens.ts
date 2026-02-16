import crypto from "crypto";

export function generateActionToken(bytes: number = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashActionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyActionToken(token: string, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return false;
  const got = hashActionToken(token);
  // constant-time compare
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}


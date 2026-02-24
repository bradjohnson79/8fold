import crypto from "node:crypto";
import { AppraisalTokenClaimsSchema, type AppraisalTokenClaims } from "@/src/validation/v4/jobCreateSchema";

export const APPRAISAL_TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const secret = String(process.env.V4_APPRAISAL_TOKEN_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").trim();
  if (!secret) throw new Error("V4_APPRAISAL_TOKEN_SECRET is required");
  return secret;
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function buildAppraisalPayloadHash(input: {
  userId: string;
  title: string;
  description: string;
  tradeCategory: string;
  provinceState: string;
  latitude: number;
  longitude: number;
  isRegionalRequested: boolean;
}): string {
  const payload = JSON.stringify({
    userId: String(input.userId).trim(),
    title: String(input.title).trim(),
    description: String(input.description).trim(),
    tradeCategory: String(input.tradeCategory).trim().toUpperCase(),
    provinceState: String(input.provinceState).trim().toUpperCase(),
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    isRegionalRequested: Boolean(input.isRegionalRequested),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function issueAppraisalToken(claims: Omit<AppraisalTokenClaims, "v" | "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = AppraisalTokenClaimsSchema.parse({
    v: 1,
    ...claims,
    iat: now,
    exp: now + APPRAISAL_TOKEN_TTL_SECONDS,
  });
  const payloadB64 = base64Url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyAppraisalToken(token: string): AppraisalTokenClaims | null {
  const raw = String(token ?? "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(payloadB64);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    return AppraisalTokenClaimsSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export function verifyAppraisalTokenOrThrow(args: {
  token: string;
  expectedUserId: string;
  expectedPayloadHash: string;
  nowEpochSeconds?: number;
}): AppraisalTokenClaims {
  const claims = verifyAppraisalToken(args.token);
  if (!claims) throw Object.assign(new Error("Invalid appraisalToken"), { status: 400 });

  if (claims.userId !== args.expectedUserId) {
    throw Object.assign(new Error("appraisalToken user mismatch"), { status: 400 });
  }
  if (claims.payloadHash !== args.expectedPayloadHash) {
    throw Object.assign(new Error("appraisalToken payload mismatch"), { status: 400 });
  }
  const now = typeof args.nowEpochSeconds === "number" ? args.nowEpochSeconds : Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    throw Object.assign(new Error("appraisalToken expired"), { status: 400 });
  }
  return claims;
}

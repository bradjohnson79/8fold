import { auth } from "@clerk/nextjs/server";

type ClaimsRecord = Record<string, unknown>;

function asRecord(value: unknown): ClaimsRecord {
  if (value && typeof value === "object") return value as ClaimsRecord;
  return {};
}

function normalizeRole(roleRaw: unknown): string {
  const role = String(roleRaw ?? "").trim().toUpperCase();
  if (!role) return "USER_ROLE_NOT_ASSIGNED";
  return role;
}

function getClaimString(claims: ClaimsRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type ClerkIdentity = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  superuser: boolean;
};

export async function getClerkIdentity(): Promise<ClerkIdentity | null> {
  const authState = await auth();
  const userId = String(authState.userId ?? "").trim();
  if (!userId) return null;

  const claims = asRecord(authState.sessionClaims);
  const publicMetadata = asRecord(claims.public_metadata);
  const unsafeMetadata = asRecord(claims.unsafe_metadata);
  const role = normalizeRole(publicMetadata.role ?? unsafeMetadata.role);

  const email =
    getClaimString(claims, ["email", "email_address"]) ??
    getClaimString(asRecord(claims.primary_email_address), ["email_address"]);
  const firstName = getClaimString(claims, ["first_name", "given_name"]);
  const lastName = getClaimString(claims, ["last_name", "family_name"]);
  const superuser = Boolean(publicMetadata.superuser) || role === "ADMIN";

  return {
    userId,
    email,
    firstName,
    lastName,
    role,
    superuser,
  };
}

import { getValidatedApiOrigin } from "./env";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (apps/admin)`);
  return String(v).trim();
}

export type AdminIdentity = {
  adminId: string;
  internalSecret: string;
  apiOrigin: string;
};

export function requireAdminIdentity(): AdminIdentity {
  const adminId = env("ADMIN_ID");
  const internalSecret = env("INTERNAL_SECRET");
  const apiOrigin = getValidatedApiOrigin();
  return { adminId, internalSecret, apiOrigin };
}

export function adminHeaders(id: AdminIdentity): Record<string, string> {
  return {
    "x-admin-id": id.adminId,
    "x-internal-secret": id.internalSecret,
  };
}


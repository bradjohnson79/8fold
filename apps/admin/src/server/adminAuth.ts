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
  const apiOrigin = String(process.env.API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!apiOrigin) throw new Error("API_ORIGIN is required (apps/admin)");
  return { adminId, internalSecret, apiOrigin };
}

export function adminHeaders(id: AdminIdentity): Record<string, string> {
  return {
    "x-admin-id": id.adminId,
    "x-internal-secret": id.internalSecret,
  };
}


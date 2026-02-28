import { vi } from "vitest";

type MockAdminAuthOptions = {
  userId?: string;
  email?: string;
};

export function installMockAdminAuth(options?: MockAdminAuthOptions): void {
  const userId = String(options?.userId ?? process.env.FIN_ADMIN_ID ?? "admin_test_super");
  const email = String(options?.email ?? "admin-super@8fold.test");

  // adminTier.tierFromEmail() resolves ADMIN_SUPER when this email is allowlisted.
  process.env.ADMIN_SUPER_EMAILS = email;
  process.env.FIN_ADMIN_ID = userId;

  vi.doMock("@/src/auth/requireAuth", () => ({
    requireAuth: vi.fn(async () => ({
      requestId: "test-request-id",
      clerkUserId: "test-clerk-user-id",
      internalUser: {
        id: userId,
        role: "ADMIN",
        email,
        phone: null,
        status: "ACTIVE",
      },
    })),
  }));

  // New admin routes authenticate through requireAdminV4/admin session tiering.
  vi.doMock("@/src/auth/requireAdminV4", () => ({
    requireAdminV4: vi.fn(async () => ({
      adminId: userId,
      email,
      role: "ADMIN_SUPER",
    })),
  }));
}

import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { validateAdminEnv } from "@/server/env";
import { adminApiFetch } from "@/server/adminApi";

// Phase 16: Fail-fast env validation. Admin must not boot with invalid API_ORIGIN.
// Runs once per module load and does not depend on request context.
validateAdminEnv();

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  try {
    // Session validation is DB-authoritative in apps/api (admin_session cookie).
    const me = await adminApiFetch<{ admin?: { email?: string | null } }>("/api/admin/me", {
      method: "GET",
    });
    const adminEmail = me?.admin?.email ? String(me.admin.email) : null;

    return <AdminLayout adminEmail={adminEmail}>{children}</AdminLayout>;
  } catch {
    redirect("/login");
  }
}


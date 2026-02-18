import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { validateAdminEnv } from "@/server/env";
import { adminApiFetch } from "@/server/adminApi";

// Phase 16: Fail-fast env validation. Admin must not boot with invalid API origin.
// Runs once per module load and does not depend on request context.
validateAdminEnv();

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  try {
    const me = await adminApiFetch<{
      admin: { id: string; email: string; role: string };
      adminTier: "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";
    }>("/api/admin/me", { method: "GET" });
    const admin = (me as any)?.admin ?? null;
    const tier = String((me as any)?.adminTier ?? "ADMIN_OPERATOR").trim().toUpperCase();

    const adminEmail = admin?.email ? String(admin.email) : null;
    return <AdminLayout adminEmail={adminEmail} adminTier={tier as any}>{children}</AdminLayout>;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : null;
    if (status === 401) redirect("/login");
    if (status === 403) redirect("/403");
    throw err;
  }
}


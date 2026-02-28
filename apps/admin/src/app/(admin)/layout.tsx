import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { validateAdminEnv } from "@/server/env";
import { adminApiFetch } from "@/server/adminApiV4";

// Phase 16: Fail-fast env validation. Admin must not boot with invalid API origin.
// Runs once per module load and does not depend on request context.
validateAdminEnv();

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const fallbackTier: "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER" = "ADMIN_OPERATOR";
  try {
    const me = await adminApiFetch<{
      admin: { id: string; email: string; role: string };
      adminTier: "ADMIN_VIEWER" | "ADMIN_OPERATOR" | "ADMIN_SUPER";
    }>("/api/admin/v4/me", { method: "GET" });
    const admin = (me as any)?.admin ?? null;
    const tier = String((me as any)?.adminTier ?? "ADMIN_OPERATOR").trim().toUpperCase();

    const adminEmail = admin?.email ? String(admin.email) : null;
    return <AdminLayout adminEmail={adminEmail} adminTier={tier as any}>{children}</AdminLayout>;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : null;
    // Instrumentation: log before redirect/degrade so Vercel logs show the actual error
    console.error("[ADMIN_LAYOUT_ERROR]", {
      message: err?.message,
      status,
      name: err?.name,
      stack: err?.stack?.split("\n").slice(0, 3).join(" | "),
    });
    if (status === 401) redirect("/login");
    if (status === 403) redirect("/403");
    // Non-auth upstream failures (timeout/network/5xx) should not hard-crash SSR layout.
    // Degrade gracefully and let child pages render their own data/error states.
    return <AdminLayout adminEmail={null} adminTier="ADMIN_OPERATOR">{children}</AdminLayout>;
  }
}

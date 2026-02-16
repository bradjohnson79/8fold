import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { roleRootPath } from "@/server/routing/roleRouting";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";

export default async function JobPosterAppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/job-poster");
  const root = roleRootPath(session.role);
  if (root !== "/app/job-poster") redirect(root);

  // If onboarding is incomplete, redirect to the wizard (never surface raw 403s in app pages).
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const resp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as any;
  const profileOk = Boolean(resp.ok && json && (json as any).ok === true && (json as any).steps?.profile?.ok);
  if (!profileOk) redirect("/app/job-poster/onboarding");

  return children;
}


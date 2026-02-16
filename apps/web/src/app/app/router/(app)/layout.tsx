import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";

export default async function RouterAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/router");

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const resp = await apiFetch({ path: "/api/web/onboarding/status", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok || !json || (json as any).ok !== true) redirect("/login?next=/app/router");

  const steps = (json as any).steps as { tos?: { ok?: boolean }; profile?: { ok?: boolean }; verified?: { ok?: boolean } } | undefined;
  const tosOk = Boolean(steps?.tos?.ok);
  const profileOk = Boolean(steps?.profile?.ok);
  const verifiedOk = Boolean(steps?.verified?.ok);

  if (!verifiedOk) redirect("/app/router");
  if (!tosOk) redirect("/app/router");
  if (!profileOk) redirect("/app/router/profile");

  return <>{children}</>;
}


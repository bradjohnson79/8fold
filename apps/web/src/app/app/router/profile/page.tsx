import { redirect } from "next/navigation";
import RouterProfileClient from "./RouterProfileClient";
import { requireServerSession } from "@/server/auth/requireServerSession";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";

type RouterProfileResp = { router?: { termsAccepted?: boolean } };

export default async function RouterProfilePage() {
  const session = await requireServerSession();
  if (!session?.userId) redirect("/login?next=/app/router/profile");

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const resp = await apiFetch({ path: "/api/web/router/profile", method: "GET", sessionToken: token });
  const json = (await resp.json().catch(() => null)) as RouterProfileResp | null;
  if (!resp.ok || !json) redirect("/login?next=/app/router/profile");

  const termsAccepted = Boolean(json.router?.termsAccepted);
  if (!termsAccepted) redirect("/app/router");

  return <RouterProfileClient />;
}


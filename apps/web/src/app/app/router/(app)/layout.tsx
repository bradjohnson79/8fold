import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";
import { TopRightLogout } from "@/components/TopRightLogout";

export default async function RouterAppLayout({ children }: { children: React.ReactNode }) {
  let ready = true;
  try {
    const token = await requireApiToken();
    const resp = await apiFetch({ path: "/api/web/v4/readiness", method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    ready = Boolean(resp.ok && json?.routerReady);
  } catch {
    ready = true;
  }

  return (
    <>
      <TopRightLogout />
      {!ready && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
          <h3 className="text-base font-semibold text-amber-900">Complete Your Router Setup</h3>
          <a
            href="/router/setup"
            className="mt-3 inline-flex rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Go to Setup
          </a>
        </div>
      )}
      {children}
    </>
  );
}


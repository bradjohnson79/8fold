import { ok } from "@/lib/apiSafe";
import { getSidFromRequest, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  return (async () => {
    try {
      const session = await requireSession(req);
      if (String(session.role ?? "").toUpperCase() !== "ROUTER") return ok({ ok: true });
      const sessionToken = getSidFromRequest(req);
      if (!sessionToken) return ok({ ok: true });
      const body = await req.text();

      await apiFetch({
        path: "/api/router/profile",
        method: "POST",
        sessionToken,
        request: req,
        headers: { "content-type": "application/json" },
        body,
      }).catch(() => null);

      // Non-blocking: profile saves must not crash UI.
      return ok({ ok: true });
    } catch {
      return ok({ ok: true });
    }
  })().catch(() => ok({ ok: true }));
}


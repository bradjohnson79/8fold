import { NextResponse } from "next/server";
import { apiFetch } from "@/server/api/apiClient";
import { getClerkIdentity } from "@/server/auth/clerkIdentity";
import { requireApiToken } from "@/server/auth/requireSession";

type SyncResponse =
  | { ok: true; dbUserExists: boolean }
  | { ok: false; dbUserExists: boolean | null; error: string };

function parseDbUserExists(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.ok !== true) return false;
  const data = payload.data;
  const id = typeof data?.id === "string" ? data.id.trim() : "";
  return id.length > 0;
}

export async function POST(req: Request) {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ ok: false, dbUserExists: null, error: "Unauthorized" } satisfies SyncResponse, { status: 401 });
  }

  try {
    const token = await requireApiToken();
    const meResp = await apiFetch({
      path: "/api/me",
      method: "GET",
      request: req,
      sessionToken: token,
      timeoutMs: 5_000,
    });
    const meJson = (await meResp.json().catch(() => null)) as any;

    if (meResp.ok && parseDbUserExists(meJson)) {
      return NextResponse.json({ ok: true, dbUserExists: true } satisfies SyncResponse);
    }

    const role = String(identity.role ?? "").trim().toUpperCase();
    if (role === "JOB_POSTER" || role === "CONTRACTOR" || role === "ROUTER") {
      const upsertResp = await apiFetch({
        path: "/api/onboarding/role",
        method: "POST",
        request: req,
        sessionToken: token,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
        timeoutMs: 5_000,
      });

      if (upsertResp.ok || upsertResp.status === 409) {
        return NextResponse.json({ ok: true, dbUserExists: true } satisfies SyncResponse);
      }
    }

    return NextResponse.json(
      { ok: false, dbUserExists: false, error: "User is authenticated but not yet provisioned in the app database." } satisfies SyncResponse,
      { status: 200 },
    );
  } catch (error) {
    console.error("[auth.sync-user] non-blocking sync failed", error);
    return NextResponse.json(
      { ok: false, dbUserExists: null, error: "We couldn't sync your account. Try again." } satisfies SyncResponse,
      { status: 200 },
    );
  }
}

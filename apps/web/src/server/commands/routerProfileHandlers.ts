import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { apiFetch } from "@/server/api/apiClient";

type RouterProfileGetResult = {
  ok: true;
  router: {
    homeRegionCode: string | null;
    homeCountry: string | null;
    email: string | null;
    termsAccepted: boolean;
    profileComplete: boolean;
  } | null;
  profile: {
    name: string | null;
    addressPrivate: string | null;
    state: string | null;
  } | null;
};

type RouterProfileUpdatePayload = {
  name?: string | null;
  email?: string | null;
  addressPrivate?: string | null;
  termsAccepted?: boolean | null;
  // Explicit router home region (no inference/fallback).
  country?: string | null;
  regionCode?: string | null;
  // Legacy field (deprecated): prefer regionCode.
  stateProvince?: string | null;
};

function isAdminRole(roleRaw: unknown): boolean {
  const r = String(roleRaw ?? "").toUpperCase();
  return r === "ADMIN";
}

function truthyBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "true" || s === "1" || s === "yes" || s === "y" || s === "on";
}

function nonEmpty(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export function registerRouterProfileHandlers() {
  const KEY = "__ROME_ROUTER_PROFILE_HANDLERS__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  bus.register("router.profile.get", async ({ context }): Promise<RouterProfileGetResult> => {
    const token = nonEmpty((context as any).sessionToken);
    if (!token) {
      throw new BusError({ code: "UNAUTHENTICATED", message: "Unauthorized", status: 401, expose: true, requestId: context.requestId });
    }

    const resp = await apiFetch({ path: "/api/web/router/profile", method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : "Unauthorized";
      throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
    }

    return {
      ok: true,
      router: json?.router ?? null,
      profile: json?.profile ?? null,
    };
  });

  bus.register(
    "router.profile.update",
    async ({ payload, context }: { payload: RouterProfileUpdatePayload; context: any }): Promise<{ ok: true }> => {
      const token = nonEmpty((context as any).sessionToken);
      if (!token) {
        throw new BusError({ code: "UNAUTHENTICATED", message: "Unauthorized", status: 401, expose: true, requestId: context.requestId });
      }

      // Forward to apps/api which owns router profile persistence + gating recompute.
      const resp = await apiFetch({
        path: "/api/web/router/profile",
        method: "POST",
        sessionToken: token,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Upstream error";
        throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
      }

      return { ok: true };
    }
  );
}

registerRouterProfileHandlers();


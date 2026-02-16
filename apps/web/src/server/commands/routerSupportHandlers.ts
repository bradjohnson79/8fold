import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";
import { apiFetch } from "@/server/api/apiClient";

type Ctx = {
  requestId: string;
  now: Date;
  sessionToken?: string | null;
  session?: { userId: string; role?: string | null } | null;
  ip?: string | null;
  userAgent?: string | null;
};

function requireToken(ctx: Ctx): string {
  const token = String(ctx.sessionToken ?? "").trim();
  if (!token) {
    throw new BusError({ code: "UNAUTHENTICATED", message: "Unauthorized", status: 401, expose: true, requestId: ctx.requestId });
  }
  return token;
}

const REGISTER_KEY = "__ROME_ROUTER_SUPPORT_HANDLERS_REGISTERED__";

if (!(globalThis as any)[REGISTER_KEY]) {
  (globalThis as any)[REGISTER_KEY] = true;

  // POST /api/app/router/terms/accept -> apps/api
  bus.register("router.terms.accept", async ({ context }: { context: Ctx }) => {
    const token = requireToken(context);
    const resp = await apiFetch({ path: "/api/web/router/terms/accept", method: "POST", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : "Failed";
      throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
    }
    return { ok: true };
  });

  // GET /api/app/router/support/inbox -> apps/api (router staff inbox)
  bus.register("router.support.inbox.list", async ({ payload, context }: { payload: { status?: string; type?: string }; context: Ctx }) => {
    const token = requireToken(context);
    const qs = new URLSearchParams();
    if (payload?.status) qs.set("status", String(payload.status));
    if (payload?.type) qs.set("type", String(payload.type));
    const path = `/api/web/router/support/inbox${qs.toString() ? `?${qs.toString()}` : ""}`;
    const resp = await apiFetch({ path, method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : "Failed";
      throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
    }
    return json;
  });

  // GET /api/app/router/support/tickets/:id -> apps/api admin ticket detail (senior router permitted)
  bus.register("router.support.ticket.get", async ({ payload, context }: { payload: { ticketId: string }; context: Ctx }) => {
    const token = requireToken(context);
    const id = String(payload?.ticketId ?? "").trim();
    if (!id) {
      throw new BusError({ code: "INVALID_INPUT", message: "Missing ticketId", status: 400, expose: true, requestId: context.requestId });
    }
    const resp = await apiFetch({ path: `/api/admin/support/tickets/${encodeURIComponent(id)}`, method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : "Failed";
      throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
    }
    const data = json?.data ?? {};
    return { ticket: data.ticket ?? null, messages: data.messages ?? [], attachments: data.attachments ?? [] };
  });

  // POST /api/app/router/support/tickets/:id/assign-to-me -> apps/api
  bus.register("router.support.ticket.assignToMe", async ({ payload, context }: { payload: { ticketId: string }; context: Ctx }) => {
    const token = requireToken(context);
    const id = String(payload?.ticketId ?? "").trim();
    if (!id) {
      throw new BusError({ code: "INVALID_INPUT", message: "Missing ticketId", status: 400, expose: true, requestId: context.requestId });
    }
    const resp = await apiFetch({
      path: `/api/admin/support/tickets/${encodeURIComponent(id)}/assign-to-me`,
      method: "POST",
      sessionToken: token,
    });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : "Failed";
      throw new BusError({ code: "UPSTREAM_ERROR", message: msg, status: resp.status || 500, expose: true, requestId: context.requestId });
    }
    return json;
  });
}


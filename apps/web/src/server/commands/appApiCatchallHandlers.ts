import { bus } from "@/server/bus/bus";
import { BusError } from "@/server/bus/errors";

export function registerAppApiCatchallHandlers() {
  const KEY = "__ROME_APP_API_CATCHALL_HANDLERS__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  bus.register("app.api.notFound", async ({ payload, context }: { payload: any; context: any }) => {
    const path = typeof payload?.path === "string" ? payload.path : "unknown";
    throw new BusError({
      code: "NOT_FOUND",
      message: `Unknown /api/app route: ${path}`,
      status: 404,
      expose: true,
      requestId: context.requestId,
    });
  });
}

registerAppApiCatchallHandlers();


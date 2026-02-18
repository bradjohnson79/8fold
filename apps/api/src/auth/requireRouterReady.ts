import { NextResponse } from "next/server";
import type { ApiAuthedUser } from "./rbac";
import { requireRouter } from "./rbac";
import { toHttpError } from "../http/errors";
import { getRouterSessionData } from "./routerSession";

/**
 * Hard gate for router tools/data endpoints.
 *
 * Single truth: readiness is derived from `getRouterSessionData()` which matches
 * `GET /api/web/router/session`.
 */
export async function requireRouterReady(req: Request): Promise<ApiAuthedUser | NextResponse> {
  let user: ApiAuthedUser;
  try {
    user = await requireRouter(req);
  } catch (err) {
    const { status } = toHttpError(err);
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: status || 401 });
  }

  const snap = await getRouterSessionData(user.userId);
  if (snap.state !== "READY") {
    return NextResponse.json(
      { ok: false, error: "router_not_ready", state: snap.state, missingFields: snap.missingFields },
      { status: 403 },
    );
  }

  return user;
}


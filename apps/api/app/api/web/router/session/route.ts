import { NextResponse } from "next/server";
import { requireRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { getRouterSessionData } from "../../../../../src/auth/routerSession";

export async function GET(req: Request) {
  try {
    const router = await requireRouter(req);
    const data = await getRouterSessionData(router.userId);
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    const { status } = toHttpError(err);
    // Session contract is strict: never leak SQL/DB errors.
    return NextResponse.json({ ok: false, error: "SESSION_LOAD_FAILED" }, { status: status || 500 });
  }
}


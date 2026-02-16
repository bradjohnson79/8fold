import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/rbac";
import { toHttpError } from "../../../src/http/errors";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}


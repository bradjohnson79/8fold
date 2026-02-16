import { NextResponse } from "next/server";

export type ReadJsonOk = { ok: true; json: unknown };
export type ReadJsonErr = { ok: false; resp: NextResponse };

export async function readJsonBody(req: Request): Promise<ReadJsonOk | ReadJsonErr> {
  try {
    const json = await req.json();
    return { ok: true, json };
  } catch {
    return { ok: false, resp: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }) };
  }
}


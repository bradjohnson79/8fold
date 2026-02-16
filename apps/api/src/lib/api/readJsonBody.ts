import { NextResponse } from "next/server";
import { badRequest } from "./respond";

export type ReadJsonOk = { ok: true; json: unknown };
export type ReadJsonErr = { ok: false; resp: NextResponse };

/**
 * Strict JSON body reader for API routes.
 *
 * - Returns 400 invalid_json when body is missing/invalid JSON.
 * - Prevents silent `.catch(() => ({}))` patterns that mask client errors.
 */
export async function readJsonBody(req: Request): Promise<ReadJsonOk | ReadJsonErr> {
  try {
    const json = await req.json();
    return { ok: true, json };
  } catch {
    return { ok: false, resp: badRequest("invalid_json") };
  }
}


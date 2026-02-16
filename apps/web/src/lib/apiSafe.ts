import { NextResponse } from "next/server";

export function ok(data: any) {
  return NextResponse.json(data, { status: 200 });
}

export function fail(code: string, meta?: any, status = 200) {
  return NextResponse.json({ ok: false, code, meta }, { status });
}


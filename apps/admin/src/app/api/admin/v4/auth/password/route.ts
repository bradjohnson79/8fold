import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/v4/auth/password`;

  const body = await req.text();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body,
    cache: "no-store",
  });

  const text = await resp.text();
  const out = new NextResponse(text, { status: resp.status });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return out;
}

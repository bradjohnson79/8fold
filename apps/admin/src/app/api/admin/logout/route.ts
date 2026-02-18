import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/logout`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      // Forward admin_session cookie to the API so it can revoke it.
      cookie: req.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  const json = await resp.text();
  const res = new NextResponse(json, { status: resp.status });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) res.headers.set("set-cookie", setCookie);
  res.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return res;
}


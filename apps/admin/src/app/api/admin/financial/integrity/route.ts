import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function GET(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const u = new URL(req.url);
  const qs = u.searchParams.toString();
  const url = `${apiOrigin}/api/admin/financial/integrity${qs ? `?${qs}` : ""}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      // Forward admin_session cookie to the API (browser cannot call API directly).
      cookie: req.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  const text = await resp.text();
  const res = new NextResponse(text, { status: resp.status });
  res.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return res;
}


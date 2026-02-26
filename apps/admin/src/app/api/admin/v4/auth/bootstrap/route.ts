import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/v4/auth/bootstrap`;

  const raw = await req.text();
  const parsed = JSON.parse(raw || "{}") as {
    email?: string;
    password?: string;
    adminSecret?: string;
    bootstrapToken?: string;
    inviteToken?: string;
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: parsed.email,
      password: parsed.password,
      bootstrapToken: parsed.bootstrapToken ?? parsed.adminSecret,
      inviteToken: parsed.inviteToken,
    }),
    cache: "no-store",
  });

  const text = await resp.text();
  const out = new NextResponse(text, { status: resp.status });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return out;
}

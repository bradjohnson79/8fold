import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

async function relayProxyResponse(res: Response) {
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return new Response(null, { status: res.status });
  }

  const text = await res.text().catch(() => "");
  if (!text.trim()) {
    return new Response(null, { status: res.status });
  }

  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain; charset=utf-8" },
    });
  }
}

export async function GET() {
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "GET" });
  return relayProxyResponse(res);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "POST", body });
  return relayProxyResponse(res);
}

export async function OPTIONS() {
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "OPTIONS", body: {} });
  return relayProxyResponse(res);
}

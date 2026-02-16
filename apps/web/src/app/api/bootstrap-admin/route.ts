import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api/readJsonBody";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  const j = await readJsonBody(req);
  if (!j.ok) return j.resp;

  const resp = await apiFetch({
    target: "admin",
    path: "/api/bootstrap-admin",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(j.json),
  });

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
  });
}


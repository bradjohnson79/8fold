import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const resp = await apiFetch({
      path: "/api/job-draft",
      method: "GET",
      sessionToken: token,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ success: false, message: "Failed to load draft." }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireSession(req);
    const token = await requireApiToken();
    const contentType = req.headers.get("content-type") ?? "application/json";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/job-draft",
      method: "PATCH",
      sessionToken: token,
      headers: { "content-type": contentType },
      body,
      request: req,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json({ success: false, message: "Failed to save draft." }, { status });
  }
}

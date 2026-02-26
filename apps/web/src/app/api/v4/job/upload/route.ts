import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch, getApiOrigin } from "@/server/api/apiClient";

export async function POST(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken(req);
    const contentType = req.headers.get("content-type") ?? "multipart/form-data";
    const body = await req.arrayBuffer();
    const resp = await apiFetch({
      path: "/api/web/v4/job/upload",
      method: "POST",
      sessionToken,
      headers: { "content-type": contentType },
      body,
    });
    const contentTypeOut = resp.headers.get("content-type") ?? "";
    const text = await resp.text();
    const parsed = contentTypeOut.includes("application/json")
      ? ((JSON.parse(text || "{}") as unknown) ?? {})
      : {};

    if (!resp.ok) {
      const code = String((parsed as any)?.error?.code ?? "UPLOAD_FAILED");
      const message = String((parsed as any)?.error?.message ?? "Upload failed. Please try again.");
      return NextResponse.json({ ok: false, error: { code, message } }, { status: resp.status });
    }

    const uploadId = String((parsed as any)?.uploadId ?? "").trim();
    const rawUrl = String((parsed as any)?.url ?? "").trim();
    if (!uploadId || !rawUrl) {
      return NextResponse.json(
        { ok: false, error: { code: "UPLOAD_FAILED", message: "Upload failed. Please try again." } },
        { status: 500 },
      );
    }

    const url = rawUrl.startsWith("/") ? `${getApiOrigin()}${rawUrl}` : rawUrl;
    return NextResponse.json({
      ok: true,
      uploadId,
      url,
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { ok: false, error: { code: "UPLOAD_FAILED", message: "Upload failed. Please try again." } },
      { status },
    );
  }
}

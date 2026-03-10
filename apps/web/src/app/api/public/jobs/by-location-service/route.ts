import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { apiFetch } from "@/server/api/apiClient";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = url.searchParams.get("country") ?? "";
  const regionCode = url.searchParams.get("regionCode") ?? "";
  const city = url.searchParams.get("city") ?? "";
  const service = url.searchParams.get("service") ?? "";

  if (!regionCode || !city || !service) {
    return NextResponse.json(
      { ok: false, error: "Missing regionCode, city, or service", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const requestId = crypto.randomUUID();
  try {
    const apiUrl = `/api/public/jobs/by-location-service?${url.searchParams.toString()}`;
    const resp = await apiFetch({ path: apiUrl, method: "GET" });
    const json = await resp.json().catch(() => null);
    return NextResponse.json(json ?? { ok: false, error: "Invalid response" }, {
      status: resp.status,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to load jobs", code: "INTERNAL_ERROR", requestId },
      { status: 500 },
    );
  }
}

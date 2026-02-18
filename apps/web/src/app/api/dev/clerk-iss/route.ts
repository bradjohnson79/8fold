import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

function decodeJwtPayload(token: string): any {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1]!;
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}

// Dev-only helper to discover the correct `iss` claim for CLERK_ISSUER.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const token = await (await auth()).getToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = decodeJwtPayload(token) ?? {};
    const iss = typeof payload?.iss === "string" ? payload.iss : null;
    const aud = payload?.aud ?? null;
    return NextResponse.json({ ok: true, iss, aud }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_TOKEN" }, { status: 400 });
  }
}


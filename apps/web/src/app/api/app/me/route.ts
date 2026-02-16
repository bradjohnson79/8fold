import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/requireSession";

// Web-owned "who am I" endpoint.
// Deliberately does NOT expose any other identities.
export async function GET(req: Request) {
  try {
    const session = await requireSession(req);
    const role = String(session.role ?? "").trim();
    const superuser = role.toUpperCase() === "ADMIN";
    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        role,
        superuser,
      },
      { status: 200 }
    );
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        role: null,
        superuser: false,
        error: error instanceof Error ? error.message : "Failed",
      },
      { status }
    );
  }
}


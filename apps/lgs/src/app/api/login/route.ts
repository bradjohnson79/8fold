import { cookies } from "next/headers";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { password?: string } | null;
    const password = String(body?.password ?? "").trim();

    if (!password) {
      return Response.json({ ok: false, error: "Password required" }, { status: 400 });
    }

    const expected = String(process.env.LGS_AUTH_PASSWORD ?? "").trim();
    if (!expected) {
      console.error("[LGS_LOGIN] LGS_AUTH_PASSWORD env var not set");
      return Response.json({ ok: false, error: "Auth not configured" }, { status: 500 });
    }

    if (password !== expected) {
      console.warn("[LGS_LOGIN] Wrong password attempt");
      return Response.json({ ok: false, error: "Invalid password" }, { status: 401 });
    }

    (await cookies()).set("lgs_auth", "true", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    console.info("[LGS_LOGIN] Login successful");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[LGS_LOGIN] Error:", err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}

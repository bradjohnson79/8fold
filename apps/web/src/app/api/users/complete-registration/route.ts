import { NextResponse } from "next/server";
import { z } from "zod";
import { apiFetch } from "@/server/api/apiClient";
import { requireApiToken } from "@/server/auth/requireSession";

const BodySchema = z.object({
  role: z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR"]),
});

export async function POST(req: Request) {
  let token = "";
  try {
    token = await requireApiToken();
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 401;
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { message: "Invalid JSON body" } }, { status: 400 });
  }
  const body = BodySchema.safeParse(parsed);
  if (!body.success) {
    return NextResponse.json({ ok: false, error: { message: "Invalid role selection" } }, { status: 400 });
  }

  const upstream = await apiFetch({
    path: "/api/onboarding/role",
    method: "POST",
    sessionToken: token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: body.data.role }),
  });

  const payload = (await upstream.json().catch(() => null)) as any;

  // Existing users can hit this route after registration; treat immutable-role as completed.
  if (upstream.status === 409 && payload?.error?.code === "ROLE_IMMUTABLE") {
    return NextResponse.json({ ok: true, data: { status: "ALREADY_REGISTERED" } }, { status: 200 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: payload?.error ?? { message: "Registration completion failed" } },
      { status: upstream.status },
    );
  }

  return NextResponse.json({ ok: true, data: payload?.data ?? null }, { status: 200 });
}

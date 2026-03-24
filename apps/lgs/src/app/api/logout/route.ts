import { cookies } from "next/headers";

export async function POST() {
  (await cookies()).set("lgs_auth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}

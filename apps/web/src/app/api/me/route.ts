import { NextResponse } from "next/server";
import { getClerkIdentity } from "@/server/auth/clerkIdentity";

export async function GET() {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    userId: identity.userId,
    email: identity.email,
    firstName: identity.firstName,
    lastName: identity.lastName,
    role: identity.role,
    superuser: identity.superuser,
  });
}

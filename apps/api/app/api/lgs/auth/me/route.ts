import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/src/lib/auth/adminSessionAuth";

export async function GET(req: Request) {
  const result = await authenticateAdminRequest(req);
  if (result instanceof NextResponse) return result;

  return NextResponse.json({
    ok: true,
    data: {
      admin: { id: result.adminId, email: result.email, role: result.role },
      adminTier: result.role,
    },
  });
}

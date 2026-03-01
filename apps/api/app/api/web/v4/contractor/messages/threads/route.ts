import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listThreadsForContractor } from "@/src/services/v4/v4MessageService";

export async function GET(req: Request) {
  const role = await requireV4Role(req, "CONTRACTOR");
  if (role instanceof Response) return role;

  try {
    const threads = await listThreadsForContractor(role.userId);
    return NextResponse.json({ ok: true, threads }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true, threads: [] }, { status: 200 });
  }
}

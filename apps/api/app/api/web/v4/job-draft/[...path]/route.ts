import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";

function gone() {
  // eslint-disable-next-line no-console
  console.warn("[JOB_DRAFT_DEPRECATED]");
  return NextResponse.json({ success: false, message: "Draft system deprecated" }, { status: 410 });
}

export async function GET(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return gone();
}

export async function POST(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return gone();
}

export async function PATCH(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return gone();
}

export async function PUT(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return gone();
}

export async function DELETE(req: Request) {
  const role = await requireV4Role(req, "JOB_POSTER");
  if (role instanceof Response) return role;
  return gone();
}

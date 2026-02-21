import { NextResponse } from "next/server";

function gone() {
  return NextResponse.json(
    { success: false, message: "Job Post V2 removed. Use V3." },
    { status: 410 }
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}

export async function PATCH() {
  return gone();
}

export async function PUT() {
  return gone();
}

export async function DELETE() {
  return gone();
}

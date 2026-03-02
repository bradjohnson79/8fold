import { NextResponse } from "next/server";

export function legacyRouteFrozen(newRoute: string) {
  return NextResponse.json(
    {
      ok: false,
      code: "LEGACY_ROUTE_FROZEN",
      message: `This legacy route is frozen. Use ${newRoute}.`,
    },
    { status: 410 },
  );
}

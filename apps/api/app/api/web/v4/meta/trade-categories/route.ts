import { NextResponse } from "next/server";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";
import { TRADE_CATEGORIES_CANONICAL, TRADE_CATEGORIES_UI_ORDER } from "@/src/validation/v4/constants";

export async function GET() {
  try {
    return NextResponse.json({
      canonical: TRADE_CATEGORIES_CANONICAL,
      uiOrder: TRADE_CATEGORIES_UI_ORDER,
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_META_TRADE_CATEGORIES_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped), { status: wrapped.status });
  }
}

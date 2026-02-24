import { NextResponse } from "next/server";
import { TRADE_CATEGORIES_CANONICAL, TRADE_CATEGORIES_UI_ORDER } from "@/src/validation/v4/constants";

export async function GET() {
  return NextResponse.json({
    canonical: TRADE_CATEGORIES_CANONICAL,
    uiOrder: TRADE_CATEGORIES_UI_ORDER,
  });
}

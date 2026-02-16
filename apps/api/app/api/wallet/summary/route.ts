import { NextResponse } from "next/server";
import { requireUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { getWalletTotals } from "../../../../src/wallet/totals";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const totals = await getWalletTotals(user.userId);

    return NextResponse.json({ totals });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}


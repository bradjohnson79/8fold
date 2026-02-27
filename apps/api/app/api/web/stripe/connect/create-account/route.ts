import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../src/auth/rbac";
import {
  createOrRefreshStripeConnectOnboarding,
  getStripeConnectStatus,
  type StripeConnectRole,
} from "../../../../../../src/services/stripeConnectService";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const role = String(user.role ?? "").toUpperCase();
    if (role !== "ROUTER" && role !== "CONTRACTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const status = await getStripeConnectStatus({ userId: user.userId, role: role as StripeConnectRole });
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const role = String(user.role ?? "").toUpperCase();
    if (role !== "ROUTER" && role !== "CONTRACTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await createOrRefreshStripeConnectOnboarding({
      userId: user.userId,
      role: role as StripeConnectRole,
    });
    if (result.state === "CURRENCY_MISMATCH") {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

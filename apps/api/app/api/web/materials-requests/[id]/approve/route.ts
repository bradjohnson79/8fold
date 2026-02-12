import { NextResponse } from "next/server";
import { optionalUser } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";

const BodySchema = z.object({
  approve: z.literal(true)
});

export async function POST(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // v2: approval requires Stripe funding via PaymentIntent flow.
    // This endpoint is retained for compatibility but no longer performs funding.
    return NextResponse.json(
      { error: "Use /materials-requests/:id/create-payment-intent + /confirm-payment to approve & pay." },
      { status: 409 }
    );
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}


import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { createPaymentIntent, stripe } from "@/src/payments/stripe";

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const body = (await req.json().catch(() => null)) as {
      selectedPrice?: number;
      isRegional?: boolean;
    } | null;

    const selectedPrice = Number(body?.selectedPrice ?? NaN);
    if (!Number.isInteger(selectedPrice) || selectedPrice <= 0) {
      return NextResponse.json({ success: false, message: "selectedPrice must be positive cents." }, { status: 400 });
    }
    if (typeof body?.isRegional !== "boolean") {
      return NextResponse.json({ success: false, message: "isRegional must be boolean." }, { status: 400 });
    }
    const isRegional = body.isRegional;
    const totalCents = selectedPrice + (isRegional ? 2000 : 0);

    const rows = await db
      .select()
      .from(jobDraft)
      .where(and(eq(jobDraft.user_id, user.userId), eq(jobDraft.status, "ACTIVE")))
      .limit(1);
    const draft = rows[0] ?? null;
    if (!draft) {
      return NextResponse.json({ success: false, message: "Draft not found." }, { status: 404 });
    }

    const data =
      draft.data && typeof draft.data === "object" && !Array.isArray(draft.data)
        ? (draft.data as Record<string, any>)
        : {};
    const existingPiId = String(data?.payment?.paymentIntentId ?? "").trim();

    if (existingPiId && stripe) {
      const pi = await stripe.paymentIntents.retrieve(existingPiId);
      if (pi.amount !== totalCents && (pi.status === "requires_payment_method" || pi.status === "requires_confirmation")) {
        await stripe.paymentIntents.update(pi.id, {
          amount: totalCents,
          payment_method_options: {
            card: { request_extended_authorization: "if_available" },
          },
        });
      }
      if (
        pi.status === "requires_payment_method" ||
        pi.status === "requires_confirmation" ||
        pi.status === "requires_capture"
      ) {
        const refreshed = await stripe.paymentIntents.retrieve(pi.id);
        const nextData = {
          ...data,
          pricing: { ...(data.pricing ?? {}), selectedPriceCents: selectedPrice, isRegional, totalCents },
          payment: { ...(data.payment ?? {}), paymentIntentId: refreshed.id },
        };
        await db
          .update(jobDraft)
          .set({ data: nextData, updated_at: new Date(), step: "PAYMENT" })
          .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.user_id, user.userId)));
        return NextResponse.json({
          success: true,
          clientSecret: refreshed.client_secret,
          paymentIntentId: refreshed.id,
          amount: totalCents,
        });
      }
    }

    const countryCode = String(data?.details?.countryCode ?? "US").toUpperCase();
    const result = await createPaymentIntent(totalCents, {
      currency: countryCode === "CA" ? "cad" : "usd",
      captureMethod: "manual",
      requestExtendedAuthorization: true,
      idempotencyKey: `job-draft-v3:${draft.id}`,
      metadata: {
        scope: "job-draft-v3",
        draftId: String(draft.id),
        userId: user.userId,
      },
      description: "8Fold Job Draft V3 Escrow Hold",
    });

    const nextData = {
      ...data,
      pricing: { ...(data.pricing ?? {}), selectedPriceCents: selectedPrice, isRegional, totalCents },
      payment: { ...(data.payment ?? {}), paymentIntentId: result.paymentIntentId },
    };
    await db
      .update(jobDraft)
      .set({ data: nextData, updated_at: new Date(), step: "PAYMENT" })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.user_id, user.userId)));

    return NextResponse.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: totalCents,
      traceId: randomUUID(),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to create payment intent." },
      { status }
    );
  }
}

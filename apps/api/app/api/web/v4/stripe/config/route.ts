import { NextResponse } from "next/server";
import { requireJobPoster } from "@/src/auth/rbac";
import { getStripeRuntimeConfig } from "@/src/stripe/runtimeConfig";

export async function GET(req: Request) {
  try {
    await requireJobPoster(req);
    const config = getStripeRuntimeConfig();

    console.log("[STRIPE_CONFIG]", {
      skMode: config.skMode,
      pkMode: config.pkMode,
      stripeMode: config.stripeMode,
      hasSk: config.secretKeyPresent,
      hasPk: config.publishableKeyPresent,
      ok: config.ok,
    });

    if (!config.ok) {
      const status = config.errorCode === "STRIPE_MODE_MISMATCH" ? 409 : 500;
      return NextResponse.json(
        {
          ok: false,
          stripeMode: config.stripeMode,
          pkMode: config.pkMode,
          skMode: config.skMode,
          publishableKeyPresent: config.publishableKeyPresent,
          secretKeyPresent: config.secretKeyPresent,
          error: {
            code: config.errorCode ?? "STRIPE_CONFIG_MISSING",
            message: config.errorMessage ?? "Stripe configuration is invalid.",
          },
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      stripeMode: config.stripeMode,
      pkMode: config.pkMode,
      skMode: config.skMode,
      publishableKeyPresent: config.publishableKeyPresent,
      secretKeyPresent: config.secretKeyPresent,
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "STRIPE_CONFIG_FAILED";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message: err instanceof Error ? err.message : "Failed to load Stripe config.",
        },
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}

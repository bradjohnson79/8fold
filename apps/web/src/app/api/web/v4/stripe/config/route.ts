import { NextResponse } from "next/server";
import { requireApiToken, requireSession } from "@/server/auth/requireSession";
import { apiFetch } from "@/server/api/apiClient";

type Mode = "test" | "live" | "unknown";

function modeFromKey(key: string | null | undefined): Mode {
  const value = String(key ?? "").trim();
  if (!value) return "unknown";
  if (value.startsWith("pk_test_")) return "test";
  if (value.startsWith("pk_" + "live_")) return "live";
  return "unknown";
}

export async function GET(req: Request) {
  try {
    await requireSession(req);
    const sessionToken = await requireApiToken(req);

    const apiResp = await apiFetch({
      path: "/api/web/v4/stripe/config",
      method: "GET",
      sessionToken,
      request: req,
    });

    const apiJson = (await apiResp.json().catch(() => null)) as any;
    const publishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
    const webPkMode = modeFromKey(publishableKey);
    const publishableKeyPresent = publishableKey.length > 0;

    const skMode = String(apiJson?.skMode ?? "unknown") as Mode;
    const stripeMode = String(apiJson?.stripeMode ?? (skMode === "live" ? "live" : "test")) as "test" | "live";

    if (!apiResp.ok || apiJson?.ok === false) {
      const status = apiResp.status >= 400 && apiResp.status < 600 ? apiResp.status : 500;
      return NextResponse.json(
        {
          ok: false,
          stripeMode,
          pkMode: webPkMode,
          skMode,
          publishableKeyPresent,
          secretKeyPresent: Boolean(apiJson?.secretKeyPresent),
          error: {
            code: String(apiJson?.error?.code ?? "STRIPE_CONFIG_FAILED"),
            message: String(apiJson?.error?.message ?? "Stripe config check failed."),
          },
        },
        { status },
      );
    }

    if (!publishableKeyPresent) {
      return NextResponse.json(
        {
          ok: false,
          stripeMode,
          pkMode: webPkMode,
          skMode,
          publishableKeyPresent,
          secretKeyPresent: Boolean(apiJson?.secretKeyPresent),
          error: {
            code: "STRIPE_CONFIG_MISSING",
            message: "Web publishable Stripe key is missing.",
          },
        },
        { status: 500 },
      );
    }

    if (webPkMode !== "unknown" && skMode !== "unknown" && webPkMode !== skMode) {
      return NextResponse.json(
        {
          ok: false,
          stripeMode,
          pkMode: webPkMode,
          skMode,
          publishableKeyPresent,
          secretKeyPresent: Boolean(apiJson?.secretKeyPresent),
          error: {
            code: "STRIPE_MODE_MISMATCH",
            message: "Publishable and secret Stripe keys are configured for different modes.",
          },
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      stripeMode,
      pkMode: webPkMode,
      skMode,
      publishableKeyPresent,
      secretKeyPresent: Boolean(apiJson?.secretKeyPresent),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "WEB_STRIPE_CONFIG_PROXY_ERROR";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message: err instanceof Error ? err.message : "Stripe config proxy failed.",
        },
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}

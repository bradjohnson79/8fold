import { releaseFundsForJob } from "@/src/services/v4/payouts/releaseFundsService";

export type ReleaseLegResult =
  | {
      role: "CONTRACTOR" | "ROUTER" | "PLATFORM";
      method: "STRIPE";
      status: "SENT";
      amountCents: number;
      currency: "USD" | "CAD";
      stripeTransferId?: string | null;
      externalRef?: string | null;
    }
  | {
      role: "CONTRACTOR" | "ROUTER" | "PLATFORM";
      method: "STRIPE";
      status: "FAILED";
      amountCents: number;
      currency: "USD" | "CAD";
      failureReason: string;
    };

export type ReleaseJobFundsResult =
  | { ok: true; jobId: string; alreadyReleased: boolean; legs: ReleaseLegResult[] }
  | { ok: false; jobId: string; error: string; code: string };

export async function releaseJobFunds(input: {
  jobId: string;
  triggeredByUserId: string;
}): Promise<ReleaseJobFundsResult> {
  console.warn("[PAYOUT_LEGACY_RELEASE_DEPRECATED]", {
    route: "releaseJobFunds",
    jobId: String(input.jobId ?? ""),
  });

  const result = await releaseFundsForJob({
    jobId: input.jobId,
    actorRole: "SYSTEM",
    actorId: input.triggeredByUserId,
  });

  if (!result.ok) {
    return {
      ok: false,
      jobId: result.jobId,
      error: String(result.error ?? "Release failed"),
      code: String(result.code ?? "RELEASE_FAILED"),
    };
  }

  return {
    ok: true,
    jobId: result.jobId,
    alreadyReleased: Boolean(result.alreadyReleased),
    legs: (result.legs ?? []) as ReleaseLegResult[],
  };
}

"use client";

import React from "react";
import { formatMoney, type CurrencyCode } from "@8fold/shared";

export type PayoutBreakdown = {
  laborTotalCents: number;
  materialsTotalCents: number;
  transactionFeeCents: number;
  contractorPayoutCents: number;
  routerEarningsCents: number;
  platformFeeCents: number;
  totalJobPosterPaysCents: number;
};

export function PriceSlider({
  aiSuggestedTotalCents,
  minCents,
  maxCents,
  selectedPriceCents,
  onChangeSelectedPriceCents,
  breakdown,
  currency,
}: {
  aiSuggestedTotalCents: number;
  minCents?: number;
  maxCents?: number;
  selectedPriceCents: number;
  onChangeSelectedPriceCents: (v: number) => void;
  breakdown: PayoutBreakdown;
  currency: CurrencyCode;
}) {
  // Locked UX requirement (Job Poster payment step):
  // - fixed range 125..200 (dollars)
  // - fixed increment $5
  const step = 5 * 100; // $5 increments
  const min = Number.isFinite(minCents as any) ? Number(minCents) : 125 * 100;
  const max = Number.isFinite(maxCents as any) ? Number(maxCents) : 200 * 100;

  function normalizeCents(v: number): number {
    const n = Number.isFinite(v) ? Math.round(v) : min;
    const rounded = Math.round(n / step) * step;
    return Math.min(max, Math.max(min, rounded));
  }

  const normalizedSelected = normalizeCents(selectedPriceCents);
  React.useEffect(() => {
    if (normalizedSelected !== selectedPriceCents) {
      onChangeSelectedPriceCents(normalizedSelected);
    }
    // Intentionally omit `onChangeSelectedPriceCents` to avoid unstable deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSelected, selectedPriceCents]);

  const isLowest = selectedPriceCents === min;
  const isSuggested = selectedPriceCents === aiSuggestedTotalCents;

  const [footnote, setFootnote] = React.useState<null | {
    message: string;
    severity: "info" | "caution";
  }>(null);

  const cacheRef = React.useRef(new Map<number, { message: string; severity: "info" | "caution" }>());
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (isSuggested) {
      setFootnote(null);
      return;
    }

    const deltaCents = selectedPriceCents - aiSuggestedTotalCents;
    const deltaDollars = Math.round(deltaCents / 100);

    // Locked rule: footnote only when the user lowers the price below the AI baseline.
    if (deltaDollars >= 0) {
      setFootnote(null);
      return;
    }

    const cached = cacheRef.current.get(deltaDollars);
    if (cached) {
      setFootnote(cached);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const resp = await fetch("/api/app/job-poster/pricing-footnote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deltaDollars }),
          });
          const data = (await resp.json().catch(() => null)) as any;
          if (!resp.ok) throw new Error(data?.error ?? "Failed to load advisory note");
          const fn = data?.pricingFootnote ?? null;
          if (!fn || typeof fn?.message !== "string") {
            setFootnote(null);
            return;
          }
          const next = {
            message: String(fn.message).slice(0, 180),
            severity: fn.severity === "caution" ? "caution" : "info",
          } as const;
          cacheRef.current.set(deltaDollars, next);
          setFootnote(next);
        } catch {
          // Non-blocking: if advisory fails, keep UX quiet.
          setFootnote(null);
        }
      })();
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [aiSuggestedTotalCents, isSuggested, selectedPriceCents]);

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-lg font-bold text-gray-900">Recommended Price for Your Job</div>
      <div className="text-sm text-gray-600 mt-1">
        This price is based on typical jobs like yours in your area. You may adjust in $5 increments.
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold text-gray-900">
          Fine-tune your price (optional): <span className="font-mono">{formatMoney(normalizedSelected, currency)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={normalizedSelected}
          onChange={(e) => onChangeSelectedPriceCents(normalizeCents(Number(e.target.value)))}
          className="mt-2 w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatMoney(min, currency)}</span>
          <span className="flex items-center gap-2">
            <span>{formatMoney(aiSuggestedTotalCents, currency)}</span>
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-8fold-green/30 text-8fold-green bg-8fold-green/5">
              AI Recommended
            </span>
          </span>
          <span>{formatMoney(max, currency)}</span>
        </div>
        {isLowest ? (
          <div className="mt-2 text-sm text-gray-700 italic">This is the lowest price we recommend for professional-quality work.</div>
        ) : null}

        {!isSuggested && footnote ? (
          <div
            className={
              "mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
            }
          >
            {footnote.message}
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="text-sm font-bold text-gray-900">Payment Breakdown</div>
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex justify-between font-semibold">
            <span>Job Poster Pays:</span>
            <span>{formatMoney(breakdown.totalJobPosterPaysCents, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Contractor (75.0% of labor):</span>
            <span>{formatMoney(breakdown.contractorPayoutCents, currency)}</span>
          </div>
          <div className="flex justify-between text-8fold-green font-semibold">
            <span>Router (15.0% of labor):</span>
            <span>{formatMoney(breakdown.routerEarningsCents, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>8Fold Platform (10.0% of labor):</span>
            <span>{formatMoney(breakdown.platformFeeCents, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Labor portion (base):</span>
            <span>{formatMoney(breakdown.laborTotalCents, currency)}</span>
          </div>
          {breakdown.materialsTotalCents > 0 ? (
            <div className="flex justify-between text-gray-600">
              <span>Materials &amp; parts (100% → contractor):</span>
              <span>{formatMoney(breakdown.materialsTotalCents, currency)}</span>
            </div>
          ) : null}
          {breakdown.transactionFeeCents > 0 ? (
            <div className="flex justify-between text-gray-500 italic">
              <span>Transaction fees (paid by Job Poster):</span>
              <span>{formatMoney(breakdown.transactionFeeCents, currency)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Percentages apply to <span className="font-semibold">labor only</span>. Materials (if any) are paid by Job Poster and
          passed through 100% to the contractor.
        </div>
      </div>
    </div>
  );
}


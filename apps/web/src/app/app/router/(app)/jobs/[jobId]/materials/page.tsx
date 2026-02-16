"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type MaterialsResponse = {
  request: null | {
    id: string;
    status: "SUBMITTED" | "APPROVED" | "DECLINED";
    currency: "USD" | "CAD";
    totalAmountCents: number;
    submittedAt: string;
    items: {
      id: string;
      name: string;
      category: string;
      quantity: number;
      unitPriceCents: number;
      priceUrl: string;
    }[];
  };
  viewer: { isRouter: boolean };
  error?: string;
};

function money(cents: number, currency: string) {
  const amt = (cents / 100).toFixed(2);
  return currency === "CAD" ? `C$${amt}` : `$${amt}`;
}

export default function RouterMaterialsReadOnlyPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<MaterialsResponse | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/app/materials/by-job?jobId=${encodeURIComponent(jobId)}`, {
        cache: "no-store"
      });
      const json = (await resp.json().catch(() => ({}))) as MaterialsResponse;
      if (!resp.ok) throw new Error((json as any)?.error || "Failed to load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Materials (read-only)</h2>
      <p className="text-gray-600 mt-2">Routers have read-only visibility into materials requests.</p>

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-gray-600">Loading…</div>
      ) : data?.request ? (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="font-bold text-gray-900">
              Status:{" "}
              <span className="inline-flex px-2 py-1 rounded-full text-sm bg-gray-100 border border-gray-200">
                {data.request.status}
              </span>
            </div>
            <div className="text-gray-700 font-semibold">
              Total: {money(data.request.totalAmountCents, data.request.currency)}
            </div>
          </div>

          <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {data.request.items.map((it) => (
              <div key={it.id} className="p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-gray-900">{it.name}</div>
                  <div className="text-xs text-gray-500 mt-1">Category: {it.category}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Qty {it.quantity} · Unit {money(it.unitPriceCents, data.request!.currency)}
                  </div>
                </div>
                <div className="text-gray-700 font-semibold">
                  {money(it.quantity * it.unitPriceCents, data.request!.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 border border-gray-200 rounded-2xl p-6">
          <div className="font-bold text-gray-900">No materials request</div>
          <div className="text-gray-600 mt-1">There is no materials request for this job.</div>
        </div>
      )}
    </>
  );
}


"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ContractorIncentives = {
  waiverAccepted: boolean;
  error?: string;
};

export default function ContractorWaiverPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);

  async function check() {
    const resp = await fetch("/api/app/contractor/incentives", { cache: "no-store" });
    const json = (await resp.json().catch(() => ({}))) as ContractorIncentives;
    if (resp.ok && json.waiverAccepted) setAlreadyAccepted(true);
  }

  useEffect(() => {
    void check();
  }, []);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/app/contractor/waiver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accepted: true })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to record waiver");
      // Go directly to profile setup and force fresh server state.
      router.replace("/app/contractor/profile");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Contractor Waiver</h2>
      <p className="text-gray-600 mt-2">
        You must accept this waiver before you can receive routed work. (Placeholder text.)
      </p>

      {alreadyAccepted ? (
        <div className="mt-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          Waiver already accepted.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      <div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-gray-50">
        <div className="text-gray-900 font-semibold">Waiver terms (placeholder)</div>
        <ul className="mt-3 text-sm text-gray-700 space-y-2">
          <li>• You confirm you are authorized to perform the work you accept.</li>
          <li>• You agree to follow all local laws, safety requirements, and platform policies.</li>
          <li>• You acknowledge that incentives/bonuses require admin review and approval.</li>
        </ul>
      </div>

      <div className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
          id="waiver"
          disabled={alreadyAccepted}
        />
        <label htmlFor="waiver" className="text-gray-800">
          I have read and accept the contractor waiver.
        </label>
      </div>

      <div className="mt-6">
        <button
          onClick={() => void submit()}
          disabled={!accepted || loading || alreadyAccepted}
          className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
        >
          {loading ? "Submitting…" : "Accept waiver"}
        </button>
      </div>
    </>
  );
}


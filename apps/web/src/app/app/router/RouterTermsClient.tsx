"use client";

import React from "react";
import { useRouter } from "next/navigation";

export function RouterTermsClient() {
  const router = useRouter();
  const [checked, setChecked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function accept() {
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/app/router/terms/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to record acceptance");

      router.replace("/app/router/profile");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h2 className="text-lg font-bold text-gray-900">Router Terms & Conditions</h2>
      <p className="text-gray-600 mt-2">
        You must accept these terms before accessing Router tools. (v1.0)
      </p>

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      <div className="mt-6 border border-gray-200 rounded-2xl p-6 bg-gray-50 space-y-3 text-sm text-gray-700">
        <div className="font-semibold text-gray-900">Summary (placeholder)</div>
        <ul className="list-disc list-inside space-y-2">
          <li>You agree to route jobs fairly and follow platform policies.</li>
          <li>You will not share private user data outside authorized channels.</li>
          <li>Abuse or fraud results in immediate removal.</li>
        </ul>
      </div>

      <label className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={submitting}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <div className="text-sm text-gray-800">
          I accept the <span className="font-semibold">Router Terms & Conditions</span>.
        </div>
      </label>

      <div className="mt-6">
        <button
          onClick={() => void accept()}
          disabled={!checked || submitting}
          className="bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold px-5 py-2.5 rounded-lg"
        >
          {submitting ? "Recording…" : "Accept & Continue"}
        </button>
      </div>
    </>
  );
}


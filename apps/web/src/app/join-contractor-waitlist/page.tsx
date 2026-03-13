"use client";

import { useState } from "react";
import Link from "next/link";

type FormState = {
  firstName: string;
  email: string;
  city: string;
};

const INITIAL: FormState = { firstName: "", email: "", city: "" };

export default function JoinContractorWaitlistPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiOrigin =
    typeof window !== "undefined"
      ? String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim() ||
        (window.location.hostname === "localhost" ? "http://localhost:3003" : "https://api.8fold.app")
      : "https://api.8fold.app";

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`${apiOrigin}/api/public/launch-opt-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName, email: form.email, city: form.city || undefined }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(json?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-8fold-green focus:border-transparent transition";
  const labelClass = "block text-sm font-semibold text-gray-300 mb-1.5";

  return (
    <div className="min-h-screen bg-8fold-navy">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-8fold-green/20 border border-8fold-green/30 text-8fold-green-light text-xs font-bold tracking-wider uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-8fold-green-light animate-pulse" />
          California Launch Beta
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Join the Contractor Launch List
        </h1>
        <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
          Get launch updates without creating an account. We will notify you as the
          California contractor network grows and when routed jobs begin flowing.
        </p>
      </div>

      <div className="max-w-xl mx-auto px-4 pb-24">
        {success ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-lg font-semibold text-8fold-green-light">
              You're on the list!
            </p>
            <p className="mt-2 text-gray-300">
              We'll notify you when contractor routing begins in California.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5"
          >
            <div>
              <label htmlFor="firstName" className={labelClass}>First Name</label>
              <input id="firstName" type="text" required placeholder="Jane" value={form.firstName} onChange={set("firstName")} className={inputClass} />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>Email Address</label>
              <input id="email" type="email" required placeholder="jane@example.com" value={form.email} onChange={set("email")} className={inputClass} />
            </div>

            <div>
              <label htmlFor="city" className={labelClass}>City (optional)</label>
              <input id="city" type="text" placeholder="Los Angeles" value={form.city} onChange={set("city")} className={inputClass} />
            </div>

            {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-xl bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-base transition-colors shadow-lg shadow-8fold-green/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Join the Launch List"}
            </button>

            <p className="text-center text-xs text-gray-500">
              No account required. Just launch updates.
            </p>
          </form>
        )}

        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <p className="text-sm text-gray-300 font-semibold mb-3">
            Ready to create a contractor account?
          </p>
          <Link
            href="/workers/contractors"
            className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-sm transition-colors shadow-lg shadow-8fold-green/25"
          >
            Create Free Contractor Account →
          </Link>
          <p className="mt-2 text-xs text-gray-500">
            Secure your place and be ready when jobs begin routing.
          </p>
        </div>
      </div>
    </div>
  );
}

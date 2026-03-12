"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  state: string;
  roleType: "router" | "job_poster" | "";
};

const INITIAL: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  city: "",
  state: "",
  roleType: "",
};

export default function JoinWaitlistPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiOrigin =
    typeof window !== "undefined"
      ? String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim() ||
        (window.location.hostname === "localhost" ? "http://localhost:3003" : "https://api.8fold.app")
      : "https://api.8fold.app";

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roleType) {
      setError("Please select your role interest.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`${apiOrigin}/api/public/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, source: "homepage" }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.ok) {
        setError(json?.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/launch-waitlist-thank-you");
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
      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-8fold-green/20 border border-8fold-green/30 text-8fold-green-light text-xs font-bold tracking-wider uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-8fold-green-light animate-pulse" />
          California Launch Beta
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Stay Informed About the Launch
        </h1>
        <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
          We are building the California contractor network during Phase 1.
          Join the waitlist and be among the first notified when Phase 2 opens
          for routers and job posters.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-xl mx-auto px-4 pb-24">
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5"
        >
          {/* Name row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelClass}>First Name</label>
              <input
                id="firstName"
                type="text"
                required
                placeholder="Jane"
                value={form.firstName}
                onChange={set("firstName")}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>Last Name</label>
              <input
                id="lastName"
                type="text"
                required
                placeholder="Smith"
                value={form.lastName}
                onChange={set("lastName")}
                className={inputClass}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className={labelClass}>Email Address</label>
            <input
              id="email"
              type="email"
              required
              placeholder="jane@example.com"
              value={form.email}
              onChange={set("email")}
              className={inputClass}
            />
          </div>

          {/* City / State row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className={labelClass}>City</label>
              <input
                id="city"
                type="text"
                required
                placeholder="Los Angeles"
                value={form.city}
                onChange={set("city")}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="state" className={labelClass}>State</label>
              <select
                id="state"
                required
                value={form.state}
                onChange={set("state")}
                className={`${inputClass} appearance-none`}
              >
                <option value="" disabled className="bg-gray-900">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s} className="bg-gray-900">{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role interest */}
          <div>
            <p className={labelClass}>I am interested in joining as a:</p>
            <div className="flex gap-4 mt-1">
              {(["router", "job_poster"] as const).map((role) => {
                const label = role === "router" ? "Router" : "Job Poster";
                const selected = form.roleType === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { setForm((p) => ({ ...p, roleType: role })); setError(null); }}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all ${
                      selected
                        ? "border-8fold-green bg-8fold-green/20 text-white"
                        : "border-white/20 bg-white/5 text-gray-300 hover:border-white/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 font-medium">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-base transition-colors shadow-lg shadow-8fold-green/25 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Join the Waitlist"}
          </button>

          {/* Microcopy */}
          <p className="text-center text-xs text-gray-500">
            No account required. Just updates about the launch.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already a contractor?{" "}
          <Link href="/workers/contractors" className="text-8fold-green hover:underline font-semibold">
            Join Early Access →
          </Link>
        </p>
      </div>
    </div>
  );
}

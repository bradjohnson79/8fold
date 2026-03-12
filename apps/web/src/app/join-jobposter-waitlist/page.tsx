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
};

const INITIAL: FormState = { firstName: "", lastName: "", email: "", city: "", state: "" };

export default function JoinJobPosterWaitlistPage() {
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
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`${apiOrigin}/api/public/jobposter-waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
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
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold tracking-wider uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
          Phase 2 — Coming Soon
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Get Notified When Job Posting Opens
        </h1>
        <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
          We are building our California contractor network first to ensure every job
          posted gets a qualified response. Join the list to be first when posting opens.
        </p>
      </div>

      <div className="max-w-xl mx-auto px-4 pb-24">
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelClass}>First Name</label>
              <input id="firstName" type="text" required placeholder="Jane" value={form.firstName} onChange={set("firstName")} className={inputClass} />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>Last Name</label>
              <input id="lastName" type="text" required placeholder="Smith" value={form.lastName} onChange={set("lastName")} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>Email Address</label>
            <input id="email" type="email" required placeholder="jane@example.com" value={form.email} onChange={set("email")} className={inputClass} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className={labelClass}>City</label>
              <input id="city" type="text" required placeholder="Los Angeles" value={form.city} onChange={set("city")} className={inputClass} />
            </div>
            <div>
              <label htmlFor="state" className={labelClass}>State</label>
              <select id="state" required value={form.state} onChange={set("state")} className={`${inputClass} appearance-none`}>
                <option value="" disabled className="bg-gray-900">Select state</option>
                {US_STATES.map((s) => <option key={s} value={s} className="bg-gray-900">{s}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-base transition-colors shadow-lg shadow-8fold-green/25 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Notify Me When Job Posting Opens →"}
          </button>

          <p className="text-center text-xs text-gray-500">
            No account required. Just launch updates.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Are you a contractor?{" "}
          <Link href="/workers/contractors" className="text-8fold-green hover:underline font-semibold">
            Join Early Access →
          </Link>
        </p>
      </div>
    </div>
  );
}

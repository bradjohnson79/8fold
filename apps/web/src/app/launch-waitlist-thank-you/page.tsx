import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're On The List — 8Fold",
  description: "Thanks for joining the 8Fold California launch waitlist. We'll notify you when Phase 2 opens.",
};

export default function WaitlistThankYouPage() {
  return (
    <div className="min-h-screen bg-8fold-navy flex items-center">
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        {/* Success icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-8fold-green/20 flex items-center justify-center mb-8">
          <svg
            className="w-8 h-8 text-8fold-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Badge */}
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-8fold-green/20 border border-8fold-green/30 text-8fold-green-light text-xs font-bold tracking-wider uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-8fold-green-light animate-pulse" />
          California Launch Beta
        </span>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-4">
          {"You're On The List"}
        </h1>

        <p className="mt-6 text-gray-300 text-lg leading-relaxed max-w-lg mx-auto">
          Thanks for your interest in 8Fold. We are currently building the
          California contractor network during Phase 1 of the launch.
        </p>

        <p className="mt-4 text-gray-400 leading-relaxed max-w-lg mx-auto">
          You will receive updates as the network grows and be notified when
          Phase 2 opens for routers and job posters.
        </p>

        {/* Progress section */}
        <div className="mt-12 bg-white/5 border border-white/10 rounded-2xl p-8 text-left max-w-md mx-auto">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-5">
            Follow the progress of the launch
          </p>
          <ul className="space-y-4">
            {[
              "Contractor network updates",
              "Phase 2 announcements",
              "Early platform access",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-gray-300 text-sm">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-8fold-green/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-8fold-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Phase flow */}
        <div className="mt-10 flex items-center justify-center gap-4 text-sm text-gray-500">
          <span className="px-3 py-1.5 rounded-lg bg-8fold-green/20 text-8fold-green-light font-semibold">
            Phase 1: Contractor Network
          </span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400">
            Phase 2: Job Posting
          </span>
        </div>

        {/* CTA back */}
        <div className="mt-12">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl border-2 border-white/20 text-white font-bold text-base hover:bg-white/10 transition-colors"
          >
            ← Back to 8Fold
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

const BENEFITS = [
  "Keep 80–85% of job value",
  "No lead fees",
  "No bidding wars",
];

export default function ContractorLaunchCapture() {
  return (
    <section className="bg-8fold-navy border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: copy + CTAs ── */}
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-8fold-green/20 border border-8fold-green/30 text-8fold-green-light text-xs font-bold tracking-wider uppercase mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-8fold-green-light animate-pulse" />
              Phase 1 — California Launch
            </span>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Join the California<br className="hidden sm:block" /> Contractor Network
            </h2>

            <p className="mt-5 text-gray-300 leading-relaxed max-w-lg">
              We are currently building the founding contractor network across
              California before job posting opens statewide.
            </p>
            <p className="mt-2 text-gray-400 text-sm leading-relaxed max-w-lg">
              Contractors who join early will be first to receive routed jobs
              when Phase 2 launches.
            </p>

            {/* Primary CTA */}
            <div className="mt-9">
              <Link
                href="/workers/contractors"
                className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 rounded-xl bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-base transition-colors shadow-lg shadow-8fold-green/25"
              >
                Create Free Contractor Account →
              </Link>
              <p className="mt-2.5 text-xs text-gray-400 max-w-xs sm:max-w-none">
                Secure your place in the contractor network and be ready when jobs begin routing.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 mt-7 max-w-xs">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-gray-500 whitespace-nowrap">or just want updates?</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Secondary CTA */}
            <div className="mt-5">
              <Link
                href="/join-contractor-waitlist"
                className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-3.5 rounded-xl border-2 border-8fold-green/40 text-8fold-green-light font-bold text-sm hover:border-8fold-green hover:bg-8fold-green/10 transition-colors"
              >
                Join Contractor Launch List
              </Link>
              <p className="mt-2 text-xs text-gray-500">
                No account required. Just launch updates.
              </p>
            </div>
          </div>

          {/* ── Right: benefit card ── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 lg:p-10">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">
              Why contractors choose 8Fold
            </p>
            <ul className="space-y-5">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-8fold-green/20 flex items-center justify-center">
                    <svg
                      className="w-3.5 h-3.5 text-8fold-green"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-white font-semibold text-base">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-sm text-gray-400 leading-relaxed">
                8Fold routes verified local jobs directly to qualified contractors —
                no bidding, no lead fees, no race to the bottom on price.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

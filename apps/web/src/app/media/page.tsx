import type { Metadata } from "next";
import Link from "next/link";

const INTERNAL_RELEASE_PATH = "/media/official-launch-feb-2026";
const PRLOG_RELEASE_URL =
  "https://www.prlog.org/13130198-8fold-officially-launches-in-vancouver-bc-fair-trade-marketplace-for-local-trades.html";

export const metadata: Metadata = {
  title: "8Fold Media | Press Releases & Official Announcements",
  description:
    "Official 8Fold press releases, company announcements, and Vancouver launch updates. Learn more about the fair-trade marketplace for local trades.",
};

export default function MediaPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-20">
          <svg
            viewBox="0 0 1200 240"
            className="absolute bottom-0 h-full w-full"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d="M0 240V160h40v-30h30v30h20v-50h35v50h25v-70h40v70h30v-40h24v40h30v-95h42v95h32v-60h28v60h34v-80h38v80h25v-45h33v45h31v-100h45v100h28v-65h30v65h40v-50h22v50h34v-75h41v75h26v-55h30v55h32v-90h38v90h31v-60h27v60h42v-35h24v35h28v-115h44v115h36v-70h33v70h40v-95h39v95h29V240z" />
          </svg>
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">8Fold in the Media</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-200">
            Official announcements, press releases, and public updates.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Featured Press Release</div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            8Fold Officially Launches in Vancouver, BC — A Fair-Trade Marketplace for Local Trades
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">February 28, 2026</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">Vancouver, BC</span>
          </div>

          <p className="mt-5 text-slate-700">
            8Fold officially launched in Vancouver as a Canadian-built marketplace focused on transparent revenue splits,
            weekly payouts, and accountable local routing. The platform introduces a triple-approval escrow model to
            protect Job Posters, Contractors, and Routers through each phase of job completion.
          </p>
          <p className="mt-3 text-slate-700">
            The launch highlights a fixed structure that routes 80% to Contractors (85% for regional jobs), 10% to Routers, and 10% to the
            platform, with expansion plans across British Columbia and into other Canadian provinces.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={INTERNAL_RELEASE_PATH}
              className="inline-flex rounded-lg bg-8fold-navy px-5 py-3 font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Read on 8Fold
            </Link>
            <a
              href={PRLOG_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 transition-colors hover:bg-slate-100"
            >
              View on PRLog
            </a>
          </div>
        </article>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Media Contact</h3>
          <div className="mt-4 space-y-1 text-slate-700">
            <p className="font-semibold">Brad Johnson</p>
            <p>Founder, 8Fold</p>
            <p>236-8823305</p>
            <p>
              <a className="font-semibold text-8fold-navy hover:underline" href="https://8fold.app">
                8fold.app
              </a>
            </p>
            <p>
              <a className="font-semibold text-8fold-navy hover:underline" href="mailto:info@anoint.me">
                info@anoint.me
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

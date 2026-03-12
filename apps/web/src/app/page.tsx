import Link from "next/link";
import { LocationSelector } from "../components/LocationSelector";
import { HomeJobFeedClient } from "./HomeJobFeedClient";
import { HeroBackgroundVideo } from "./HeroBackgroundVideo";
import { HeroCopy } from "./HeroCopy";
import { existsSync } from "node:fs";
import path from "node:path";
import { HomepageFAQSection } from "@/components/home/HomepageFAQSection";
import { HomeTestimonials } from "@/components/home/HomeTestimonials";

/**
 * Homepage is public. No auth or API calls in SSR.
 * All data loading happens client-side.
 */
export default async function HomePage() {
  const session = null;
  const isRouter = false;

  // Phase flag — set NEXT_PUBLIC_LAUNCH_PHASE env var to advance phases without a code change.
  // Supported values: "contractor_beta" | "router_beta" | "live_marketplace" | "multi_state_expansion"
  // Default (Phase 1): "contractor_beta"
  const LAUNCH_PHASE = (process.env.NEXT_PUBLIC_LAUNCH_PHASE ?? "contractor_beta") as
    | "contractor_beta"
    | "router_beta"
    | "live_marketplace"
    | "multi_state_expansion";
  const SHOW_MARKETPLACE = LAUNCH_PHASE === "live_marketplace";
  const SHOW_JOB_POSTER_CTA = LAUNCH_PHASE === "live_marketplace";

  const heroVideoPath = String(process.env.NEXT_PUBLIC_HERO_VIDEO_PATH ?? "/hero-video.mp4").trim() || "/hero-video.mp4";
  const heroVideoEnabledByEnv = String(process.env.NEXT_PUBLIC_ENABLE_HERO_VIDEO ?? "").trim() === "1";
  const heroVideoIsExternal = /^https?:\/\//i.test(heroVideoPath);
  const heroVideoAssetPath = path.join(process.cwd(), "public", heroVideoPath.replace(/^\/+/, ""));
  const heroVideoAssetExists = heroVideoIsExternal ? true : existsSync(heroVideoAssetPath);
  const heroVideoEnabled = heroVideoEnabledByEnv && heroVideoAssetExists;
  const heroVideoDisableReason = heroVideoEnabled
    ? null
    : !heroVideoEnabledByEnv
      ? "env not enabled"
      : "missing asset";

  return (
    <div>
      {/* ───────────────────────────── 1. HERO ───────────────────────────── */}
      <section className="relative overflow-hidden bg-8fold-navy">
        <HeroBackgroundVideo
          videoEnabled={heroVideoEnabled}
          videoPath={heroVideoPath}
          disabledReason={heroVideoDisableReason}
        />

        <div className="absolute inset-0 z-10 opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-72 h-72 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left copy — A/B/C variant randomized client-side */}
            <div>
              <HeroCopy />
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <a
                  href="/workers/contractors"
                  aria-label="Join the 8Fold California contractor early access network"
                  className="inline-flex items-center justify-center px-8 py-4 bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-lg rounded-xl transition-colors shadow-lg shadow-8fold-green/25"
                >
                  Join Early Access
                </a>
                <a
                  href="/how-to-earn"
                  aria-label="Learn how 8Fold works for contractors"
                  className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-bold text-lg rounded-xl hover:bg-white hover:text-8fold-navy transition-colors duration-200"
                >
                  Learn How 8Fold Works
                </a>
              </div>
              {/* Trust micro-signal */}
              <p className="mt-5 text-center text-sm text-gray-400/80 max-w-2xl">
                California Founding Contractor Network — Limited Early Access
              </p>
            </div>

            {/* Right decorative grid */}
            <div className="hidden lg:grid grid-cols-3 gap-4">
              {[
                { icon: "📍", label: "Local Routing" },
                { icon: "🔒", label: "Secure Payments" },
                { icon: "✅", label: "Verified Work" },
                { icon: "💰", label: "Contractors Keep 80%" },
                { icon: "🛡️", label: "Full Accountability" },
                { icon: "⚡", label: "Fast Job Matching" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center hover:bg-white/10 transition-colors"
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="text-xs font-semibold text-gray-300 tracking-wide">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── 2. ACCOUNT TYPE CARDS ─────────────────────── */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              California Contractor Network Launch
            </h2>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              Build your place in the 8Fold California network before job
              posting opens statewide.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Contractors — primary card for Phase 1 */}
            <div className="group rounded-xl border-2 border-8fold-green/30 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col">
              <div className="flex-grow">
                <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-purple-100 text-purple-700 mb-5">
                  Contractor
                </span>
                <h3 className="text-xl font-bold text-gray-900">
                  Join the Contractor Network
                </h3>
                <p className="mt-3 text-gray-600 leading-relaxed">
                  Early contractors will be first to receive routed work when
                  job posting opens across California.
                </p>
                <ul className="mt-5 space-y-2">
                  {[
                    "Keep 80–85% of job value",
                    "No lead fees",
                    "No bidding wars",
                  ].map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2 text-sm font-semibold text-8fold-green">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-8">
                <Link
                  href="/workers/contractors"
                  className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-8fold-green text-white font-bold text-sm hover:bg-8fold-green-dark transition-colors shadow-sm shadow-8fold-green/20"
                >
                  Join Early Access →
                </Link>
              </div>
            </div>

            {/* Routers */}
            <div className="group rounded-xl border border-gray-200 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col">
              <div className="flex-grow">
                <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-blue-100 text-blue-700 mb-5">
                  Router
                </span>
                <h3 className="text-xl font-bold text-gray-900">
                  Local Routing Partners
                </h3>
                <p className="mt-3 text-gray-600 leading-relaxed">
                  Routers coordinate jobs in their communities and earn 10%
                  commission per completed job.
                </p>
              </div>
              <div className="mt-8">
                <Link
                  href="/workers/router"
                  className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl border-2 border-8fold-green text-8fold-green font-bold text-sm hover:bg-8fold-green hover:text-white transition-colors"
                >
                  Become a Router →
                </Link>
              </div>
            </div>

            {/* Job Posters — coming soon in Phase 1; active in Phase 2 (SHOW_JOB_POSTER_CTA) */}
            <div className={`group rounded-xl border border-gray-200 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col${SHOW_JOB_POSTER_CTA ? "" : " opacity-80"}`}>
              <div className="flex-grow">
                <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 mb-5">
                  Job Poster
                </span>
                <h3 className="text-xl font-bold text-gray-900">
                  {SHOW_JOB_POSTER_CTA ? "Post a Job With Confidence" : "Job Posting Coming Soon"}
                </h3>
                <p className="mt-3 text-gray-600 leading-relaxed">
                  {SHOW_JOB_POSTER_CTA
                    ? "Set fair AI-assisted pricing and get matched with trusted local contractors in your area."
                    : "We are preparing our contractor network before opening job posting across California. Homeowners and businesses will soon be able to post work and get matched with local contractors."}
                </p>
              </div>
              <div className="mt-8">
                {SHOW_JOB_POSTER_CTA ? (
                  <Link
                    href="/post-job"
                    className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-8fold-green text-white font-bold text-sm hover:bg-8fold-green-dark transition-colors shadow-sm shadow-8fold-green/20"
                  >
                    Post a Job →
                  </Link>
                ) : (
                  <Link
                    href="/contact"
                    className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl border-2 border-gray-300 text-gray-600 font-bold text-sm hover:border-8fold-green hover:text-8fold-green transition-colors"
                  >
                    Notify Me When Jobs Open →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── 3. HOW IT WORKS ────────────────────────────── */}
      <section id="how-it-works" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              How 8Fold Works
            </h2>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              Phase 1: Building the California contractor network before
              opening statewide job posting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-8fold-green text-white font-extrabold text-lg mb-5">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                Contractors Join the California Network
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Contractors sign up for early access to secure their place
                before job posting opens statewide.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-8fold-green text-white font-extrabold text-lg mb-5">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                Local Routers Organize Work by Region
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Local routers coordinate jobs in their communities and connect
                the right contractors to the right work.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-8fold-green text-white font-extrabold text-lg mb-5">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                Job Posting Launches Statewide
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Once contractor coverage is established across California, job
                posting opens and routed work flows to the network.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ───────────────── 4. MARKETPLACE PREVIEW ────────────────────── */}
      {/* Phase 2 restore: set LAUNCH_PHASE = "live_marketplace" at the top of this component */}
      {SHOW_MARKETPLACE && (
        <section className="bg-gray-50 border-b border-gray-100 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Live Jobs on 8Fold</h2>
              <p className="mt-2 text-gray-500">See the newest jobs currently available across the marketplace.</p>
              <p className="mt-1 text-sm text-gray-400">Real jobs currently being routed through the 8Fold marketplace.</p>
            </div>
            <LocationSelector
              title="Find Jobs in Your Area"
              subtitle="Select your province or state, then choose a city/town. City lists only include locations with jobs."
            />
          </div>
          <HomeJobFeedClient
            mode={isRouter ? "router_routable" : "guest_recent"}
            isAuthenticated={isRouter}
          />
          <div className="mt-6 text-center">
            <a href="/jobs" className="text-8fold-green font-semibold hover:underline">
              Browse All Jobs →
            </a>
          </div>
        </section>
      )}

      {/* ──────────────── 5. BENEFITS STRIP ──────────────────────────── */}
      <section className="relative overflow-hidden bg-8fold-navy py-20">
        {/* Background accents */}
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why Contractors Are Choosing 8Fold
            </h2>
            <p className="mt-3 text-gray-400 max-w-xl mx-auto">
              Why contractors are joining the 8Fold California launch phase.
            </p>
          </div>

          <div className="space-y-4">
            {/* Benefit 1 — Contractor Commissions */}
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-8fold-green/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-8fold-green-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-lg">
                    Contractors Keep 80–85% of the Job Value
                  </h3>
                  <span
                    title="Regional jobs over defined distance thresholds qualify for 85% payout."
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-gray-400 text-[10px] font-bold cursor-help hover:bg-white/20 transition-colors"
                  >
                    i
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-400">
                  80% standard payout. Up to 85% for approved regional distance jobs.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-8fold-green-light">80–85%</span>
              </div>
            </div>

            {/* Benefit 2 — Router Earnings */}
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  Routers Earn 10% Per Completed Job
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  Earn consistent income by routing verified local jobs to qualified contractors.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-blue-400">10%</span>
              </div>
            </div>

            {/* Benefit 3 — AI Pricing */}
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  AI-Assisted Median Pricing
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  Smart pricing guidance helps job posters set competitive and
                  fair job values.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-400">
                  AI-Driven
                </span>
              </div>
            </div>

            {/* Benefit 4 — Money-Back Guarantee */}
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  100% Money-Back Guarantee
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  If no contractor responds within 5 business days, posting
                  fees are refunded.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0">
                <span className="text-2xl font-extrabold text-emerald-400">100%</span>
              </div>
            </div>

            {/* Benefit 5 — Weekly Payouts */}
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  Weekly Payouts
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  Stripe-powered direct deposits provide reliable and
                  predictable payments.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400">
                  Paid Weekly
                </span>
              </div>
            </div>
          </div>

          {/* Section CTA */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/workers/contractors"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/25"
            >
              Join Contractor Network →
            </Link>
            <Link
              href="/how-to-earn"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border-2 border-white/30 text-white font-bold text-base hover:bg-white/10 transition-colors"
            >
              Learn How It Works →
            </Link>
          </div>
        </div>
      </section>

      <HomepageFAQSection />

      {/* ──────────────────── 7. TESTIMONIALS ────────────────────────── */}
      <HomeTestimonials />

      {/* ────────────────── 8. TRUST & GUARANTEE ─────────────────────── */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left side */}
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Security &amp; Protection First
              </h2>
              <p className="mt-4 text-gray-500">
                Every transaction on 8Fold is built with trust at the core.
              </p>
              <ul className="mt-8 space-y-5">
                {[
                  {
                    title: "Secure Payment Processing",
                    desc: "Industry-standard encryption and escrow protection on every job.",
                  },
                  {
                    title: "Verified Routing System",
                    desc: "Routers are vetted and accountable for every job they coordinate.",
                  },
                  {
                    title: "Transparent Job Tracking",
                    desc: "Real-time status updates from posting through completion and payout.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-8fold-green/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-8fold-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{item.title}</div>
                      <div className="text-sm text-gray-600 mt-0.5">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right side — guarantee badge */}
            <div className="flex justify-center lg:justify-end">
              <div className="bg-white rounded-3xl border-2 border-8fold-green/20 shadow-lg p-10 max-w-sm text-center">
                <div className="mx-auto w-20 h-20 rounded-full bg-8fold-green/10 flex items-center justify-center mb-6">
                  <svg className="w-10 h-10 text-8fold-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="text-2xl font-extrabold text-gray-900">
                  100% Money-Back Guarantee
                </div>
                <p className="mt-4 text-gray-600 leading-relaxed">
                  If no Contractor responds to your job within 5 business days,
                  your posting fee is fully refunded.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-8fold-green font-bold text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  No questions asked
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── 9. FINAL CTA ───────────────────────────── */}
      <section className="bg-8fold-navy">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Join the California Contractor Launch
          </h2>
          <p className="mt-4 text-gray-300 text-lg max-w-2xl mx-auto">
            Become part of the 8Fold contractor network before job posting
            opens statewide.
          </p>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
            <Link
              href="/workers/contractors"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/25"
            >
              Join Contractor Network
            </Link>
            <Link
              href="/workers/router"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl border-2 border-white/30 text-white font-bold text-base hover:bg-white/10 transition-colors"
            >
              Become a Router
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


import Link from "next/link";
import { LocationSelector } from "../components/LocationSelector";
import { HomeJobFeedClient } from "./HomeJobFeedClient";
import { requireServerSession } from "@/server/auth/requireServerSession";

export default async function HomePage() {
  let session: Awaited<ReturnType<typeof requireServerSession>> | null = null;
  try {
    session = await requireServerSession();
  } catch {
    session = null;
  }

  const isRouter = String(session?.role ?? "").trim().toUpperCase() === "ROUTER";

  return (
    <div>
      {/* ───────────────────────────── 1. HERO ───────────────────────────── */}
      <section className="relative overflow-hidden bg-8fold-navy">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left copy */}
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
                Local Work.
                <br />
                <span className="text-8fold-green-light">Routed Right.</span>
              </h1>
              <p className="mt-6 text-lg text-gray-300 max-w-xl leading-relaxed">
                8Fold serves across the United States and Canada — real jobs,
                real routing, real accountability. We connect job posters,
                routers, and contractors through a transparent platform where
                everyone earns fairly.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/signup?role=job-poster"
                  className="inline-flex items-center px-8 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/25"
                >
                  Post a Job
                </Link>
                <Link
                  href="/signup?role=contractor"
                  className="inline-flex items-center px-8 py-3.5 rounded-xl border-2 border-white/30 text-white font-bold text-base hover:bg-white/10 transition-colors"
                >
                  Become a Worker
                </Link>
              </div>
            </div>

            {/* Right decorative grid */}
            <div className="hidden lg:grid grid-cols-3 gap-4">
              {[
                { icon: "📍", label: "Local Routing" },
                { icon: "🔒", label: "Secure Payments" },
                { icon: "✅", label: "Verified Work" },
                { icon: "💰", label: "Fair Splits" },
                { icon: "🛡️", label: "Accountability" },
                { icon: "⚡", label: "Fast Matching" },
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
              Built for Every Role in the Marketplace
            </h2>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              8Fold connects Job Posters, Routers, and Contractors through a
              transparent routing system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Job Posters */}
            <div className="group rounded-xl border border-gray-200 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
              <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 mb-5">
                Job Poster
              </span>
              <h3 className="text-xl font-bold text-gray-900">
                Post with Confidence
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Set fair, AI-assisted median pricing and get matched with local
                Contractors fast.
              </p>
              <p className="mt-5 text-sm font-bold text-8fold-green">
                100% Money-Back Guarantee if no response within 5 business days.
              </p>
            </div>

            {/* Routers */}
            <div className="group rounded-xl border border-gray-200 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
              <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-blue-100 text-blue-700 mb-5">
                Router
              </span>
              <h3 className="text-xl font-bold text-gray-900">
                Earn by Routing Local Work
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Claim jobs in your area and route them to Contractors. Get
                rewarded for coordination.
              </p>
              <p className="mt-5 text-sm font-bold text-8fold-green">
                15% Commission on completed jobs. +$5 Referral Reward on completed referred jobs.
              </p>
            </div>

            {/* Contractors */}
            <div className="group rounded-xl border border-gray-200 shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
              <span className="inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-purple-100 text-purple-700 mb-5">
                Contractor
              </span>
              <h3 className="text-xl font-bold text-gray-900">
                Keep the Majority of What You Earn
              </h3>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Receive routed jobs without bidding wars. Book within 5 business
                days.
              </p>
              <p className="mt-5 text-sm font-bold text-8fold-green">
                75–80% Commission depending on region.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── 3. BENEFITS STRIP ──────────────────────────── */}
      <section className="relative overflow-hidden bg-8fold-navy py-20">
        {/* Background accents */}
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why 8Fold Is Different
            </h2>
            <p className="mt-3 text-gray-400 max-w-xl mx-auto">
              Transparent earnings. Real accountability. Built for fairness.
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
                    Up to 80% Contractor Commissions
                  </h3>
                  <span
                    title="Regional jobs over defined distance thresholds qualify for 80% payout."
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-gray-400 text-[10px] font-bold cursor-help hover:bg-white/20 transition-colors"
                  >
                    i
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-400">
                  75% standard &middot; 80% for approved regional distance jobs.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-8fold-green-light">75–80%</span>
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
                  15% Router Earnings
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  Earn consistently by routing verified local jobs.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-blue-400">15%</span>
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
                  Smart sliding scale ensures competitive and fair job pricing.
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
                  If no Contractor responds within 5 business days, posting fees
                  are refunded.
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
                  Direct deposit and PayPal available for seamless withdrawals.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400">
                  Paid Weekly
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── 4. LOCATION SELECTOR ──────────────────── */}
      <section className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <LocationSelector
            title="Find Jobs in Your Area"
            subtitle="Select your province or state to see active and in-progress jobs. We only display regions where real work is happening."
          />
        </div>
      </section>

      {/* ───────────────────── 5. MARKETPLACE PREVIEW ────────────────── */}
      <section className="py-16">
        <HomeJobFeedClient
          mode={isRouter ? "router_routable" : "guest_recent"}
          isAuthenticated={isRouter}
        />
      </section>

      {/* ──────────────────── 6. PERKS / BENEFITS ────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1e2e] via-[#13263a] to-[#0f1e2e] py-20">
        {/* Subtle center glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_60%)] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why 8Fold Works Better
            </h2>
            <p className="mt-3 text-gray-300 max-w-2xl mx-auto">
              A platform designed for balance, accountability, and local-first
              job routing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 — Fair Split */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg shadow-black/20 p-8 hover:border-emerald-500/40 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Fair Split Model</h3>
              <p className="mt-2 text-emerald-400 font-bold text-sm tracking-wide">
                75% Contractor &middot; 15% Router &middot; 10% Platform
              </p>
              <p className="mt-3 text-gray-300 leading-relaxed">
                Built for balance — not greed. Every participant earns a
                transparent, predictable share of every job.
              </p>
            </div>

            {/* Card 2 — Accountability */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg shadow-black/20 p-8 hover:border-emerald-500/40 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">
                Accountability Built In
              </h3>
              <p className="mt-3 text-gray-300 leading-relaxed">
                Triple confirmation system ensures work is completed before
                payout is released. No shortcuts, no disputes left unresolved.
              </p>
            </div>

            {/* Card 3 — Local Routing */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 shadow-lg shadow-black/20 p-8 hover:border-emerald-500/40 transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">
                Local First Routing
              </h3>
              <p className="mt-3 text-gray-300 leading-relaxed">
                Jobs are routed within your area — no random bidding wars, no
                race to the bottom. Real work, routed to real people nearby.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── 7. TESTIMONIALS ────────────────────────── */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              What Our Members Say
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                quote:
                  "Finally a platform that actually protects contractors and clients.",
                name: "Jason M.",
                role: "Contractor",
              },
              {
                quote:
                  "The routing system makes it easy to earn without chasing leads.",
                name: "Amanda T.",
                role: "Router",
              },
              {
                quote: "Transparent pricing and real follow-through.",
                name: "Mark R.",
                role: "Job Poster",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col"
              >
                <svg className="w-8 h-8 text-8fold-green/30 mb-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p className="text-gray-700 leading-relaxed text-lg flex-grow">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-8fold-navy flex items-center justify-center text-white font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">
                      {t.name}
                    </div>
                    <span className="inline-block mt-0.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-8fold-green/10 text-8fold-green">
                      {t.role}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-gray-300 text-lg max-w-2xl mx-auto">
            Join the routing platform built for fairness, accountability, and
            local growth.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/signup?role=job-poster"
              className="inline-flex items-center px-8 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/25"
            >
              Post a Job
            </Link>
            <Link
              href="/signup?role=contractor"
              className="inline-flex items-center px-8 py-3.5 rounded-xl border-2 border-white/30 text-white font-bold text-base hover:bg-white/10 transition-colors"
            >
              Sign Up as Worker
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

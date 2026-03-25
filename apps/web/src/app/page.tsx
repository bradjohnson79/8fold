import Link from "next/link";
import { HeroBackgroundVideo } from "./HeroBackgroundVideo";
import { HeroCopy } from "./HeroCopy";
import { existsSync } from "node:fs";
import path from "node:path";
import { HomepageFAQSection } from "@/components/home/HomepageFAQSection";
import { CaliforniaMarketPreview } from "@/components/home/CaliforniaMarketPreview";

/**
 * Homepage is public. No auth or API calls in SSR.
 * All data loading happens client-side.
 */
export default async function HomePage() {
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

  const primaryPaths = [
    {
      eyebrow: "Contractor",
      title: "Build steady work in your market",
      body: "Get routed verified local jobs with clear pricing, protected payments, and no bidding chaos.",
      href: "/contractors",
      cta: "Join as a Contractor →",
      accent: "bg-emerald-100 text-emerald-700",
      border: "border-8fold-green/30",
    },
    {
      eyebrow: "Job Poster",
      title: "Post once and get matched fast",
      body: "Share your project and get connected with trusted contractors inside the California trade network.",
      href: "/job-posters",
      cta: "Post a Job →",
      accent: "bg-blue-100 text-blue-700",
      border: "border-blue-200",
    },
  ] as const;

  return (
    <div>
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
              <div className="mt-10">
                <Link
                  href="/signup"
                  aria-label="Get early access to the 8Fold California trade network"
                  className="inline-flex items-center justify-center px-8 py-4 bg-8fold-green hover:bg-8fold-green-dark text-white font-bold text-lg rounded-xl transition-colors shadow-lg shadow-8fold-green/25"
                >
                  Get Early Access →
                </Link>
              </div>
              <p className="mt-5 text-center text-sm text-gray-400/80 max-w-2xl">
                California Founding Trade Network — Limited Early Access
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

      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
              Choose Your Path
            </h2>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              Start with the role that matches how you want to use 8Fold, then move into early access.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {primaryPaths.map((pathCard) => (
              <div
                key={pathCard.title}
                className={`group rounded-2xl border shadow-sm p-8 bg-white hover:-translate-y-1 hover:shadow-lg transition-all duration-200 flex flex-col ${pathCard.border}`}
              >
                <div className="flex-grow">
                  <span className={`inline-block text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full mb-5 ${pathCard.accent}`}>
                    {pathCard.eyebrow}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900">{pathCard.title}</h3>
                  <p className="mt-3 text-gray-600 leading-relaxed">{pathCard.body}</p>
                </div>
                <div className="mt-8">
                  <Link
                    href={pathCard.href}
                    className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-8fold-green text-white font-bold text-sm hover:bg-8fold-green-dark transition-colors shadow-sm shadow-8fold-green/20"
                  >
                    {pathCard.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.18em] text-gray-500">Router</div>
                <h3 className="mt-2 text-xl font-bold text-gray-900">Prefer to coordinate local jobs?</h3>
                <p className="mt-2 text-gray-600">
                  Routers stay visible, but secondary, as a lightweight path for people who want to manage local job flow and earn 8%.
                </p>
              </div>
              <div className="sm:flex-shrink-0">
                <Link
                  href="/workers/routers"
                  className="inline-flex items-center justify-center px-5 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold text-sm hover:border-8fold-green hover:text-8fold-green transition-colors"
                >
                  Explore Router Access →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-8fold-navy py-20">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-8fold-green rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-8fold-green-light rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Why the 8Fold Trade Network Works
            </h2>
            <p className="mt-3 text-gray-400 max-w-xl mx-auto">
              Designed to help contractors win work and job posters get projects completed without friction.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-8fold-green/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-8fold-green-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-lg">
                    Contractors Keep 80% on Standard Jobs
                  </h3>
                  <span
                    title="Regional distance jobs can qualify for higher contractor payout while standard California jobs stay anchored at 80%."
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-gray-400 text-[10px] font-bold cursor-help hover:bg-white/20 transition-colors"
                  >
                    i
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-400">
                  Clear economics for California launches with structured splits shown before work begins.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-8fold-green-light">80%</span>
              </div>
            </div>

            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  Routers Earn 8% Per Completed Job
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  Earn consistent income by routing verified local jobs to qualified contractors.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-blue-400">8%</span>
              </div>
            </div>

            <div className="flex items-center gap-5 bg-white/[0.06] border border-white/10 rounded-2xl px-6 py-5 hover:bg-white/[0.10] transition-colors">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1m0-1h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-white text-lg">
                  Platform Earns 12%
                </h3>
                <p className="mt-0.5 text-sm text-gray-400">
                  The platform share stays transparent so everyone understands how the marketplace is funded.
                </p>
              </div>
              <div className="hidden sm:block flex-shrink-0 text-right">
                <span className="text-2xl font-extrabold text-purple-400">12%</span>
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

        </div>
      </section>

      <CaliforniaMarketPreview />

      <HomepageFAQSection />

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

      <section className="bg-8fold-navy">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Start with the Right Role
          </h2>
          <p className="mt-4 text-gray-300 text-lg max-w-2xl mx-auto">
            Enter through early access, choose your role, and move into the California marketplace with a clear next step.
          </p>
          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-8fold-green text-white font-bold text-base hover:bg-8fold-green-dark transition-colors shadow-lg shadow-8fold-green/25"
            >
              Get Early Access →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


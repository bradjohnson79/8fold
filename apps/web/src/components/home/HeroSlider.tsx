"use client";

import React from "react";
import Link from "next/link";

type Slide = {
  key: string;
  imageUrl: string;
  imageAlt: string;
  headline: string;
  subtext: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

const SLIDES: Slide[] = [
  {
    key: "post",
    imageUrl: "/images/slider/job_poster.png",
    imageAlt: "Homeowner working on a laptop",
    headline: "Post Once. Get Routed Fast.",
    subtext: "AI median pricing + sliding scale helps you find the right contractor quickly and fairly.",
    ctaLabel: "Post a Job",
    ctaHref: "/signup",
    secondaryCtaLabel: "Learn More",
    secondaryCtaHref: "/workers/job-posters",
  },
  {
    key: "clients",
    imageUrl: "/images/slider/contractor.png",
    imageAlt: "Contractor working on-site",
    headline: "Clients Without Advertising.",
    subtext: "High-intent jobs routed directly to you. No bidding wars. No ad spend.",
    ctaLabel: "Join as a Contractor",
    ctaHref: "/signup",
    secondaryCtaLabel: "Learn More",
    secondaryCtaHref: "/workers/contractors",
  },
  {
    key: "route",
    imageUrl: "/images/slider/router.png",
    imageAlt: "Handshake between two professionals",
    headline: "Earn by Routing Local Jobs.",
    subtext: "Connect job posters with contractors and earn for successful matches.",
    ctaLabel: "Route & Earn",
    ctaHref: "/signup",
    secondaryCtaLabel: "Learn More",
    secondaryCtaHref: "/workers/routers",
  },
];

function clampIndex(i: number) {
  const n = SLIDES.length;
  return ((i % n) + n) % n;
}

function ArrowIcon(props: { dir: "left" | "right"; className?: string }) {
  const d =
    props.dir === "left"
      ? "M12.5 4.5L6.5 10l6 5.5"
      : "M7.5 4.5l6 5.5-6 5.5";
  return (
    <svg viewBox="0 0 20 20" fill="none" className={props.className ?? ""} aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeroSlider(props: {
  activeIndex: number;
  onChangeIndex: (idx: number) => void;
}) {
  const [paused, setPaused] = React.useState(false);
  const [hoverZone, setHoverZone] = React.useState<null | "left" | "right">(null);

  // Autoplay every 7s, pause on hover.
  React.useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => {
      props.onChangeIndex(clampIndex(props.activeIndex + 1));
    }, 7000);
    return () => window.clearInterval(t);
  }, [paused, props.activeIndex, props.onChangeIndex]);

  const activeIndex = clampIndex(props.activeIndex);

  return (
    <div
      className="w-full mt-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        setHoverZone(null);
      }}
    >
      <div className="relative w-full overflow-hidden bg-gradient-to-b from-[#f4fff9] to-white">
        {/* Hover zones (left/right 15%) to reveal arrows */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[15%] z-20"
          onMouseEnter={() => setHoverZone("left")}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-[15%] z-20"
          onMouseEnter={() => setHoverZone("right")}
        />
        <div
          className="absolute left-[15%] right-[15%] top-0 bottom-0 z-20"
          onMouseEnter={() => setHoverZone(null)}
        />

        {/* Arrows */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => props.onChangeIndex(clampIndex(activeIndex - 1))}
          className={[
            "absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full",
            "bg-white shadow-md border border-gray-100 transition-all duration-200",
            "text-[#1DBF73] hover:bg-[#1DBF73] hover:text-white",
            hoverZone === "left" ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <ArrowIcon dir="left" className="h-6 w-6 mx-auto" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => props.onChangeIndex(clampIndex(activeIndex + 1))}
          className={[
            "absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full",
            "bg-white shadow-md border border-gray-100 transition-all duration-200",
            "text-[#1DBF73] hover:bg-[#1DBF73] hover:text-white",
            hoverZone === "right" ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <ArrowIcon dir="right" className="h-6 w-6 mx-auto" />
        </button>

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-12">
            {/* Image (mobile above, desktop right) — portrait 9:16, ~1.3x larger */}
            <div className="order-1 md:order-2 w-full md:w-1/2 flex items-center justify-center min-h-[360px] sm:min-h-[420px]">
              <div className="relative w-full max-w-[360px] md:max-w-[420px] h-[360px] sm:h-[450px] flex items-center justify-center">
                {SLIDES.map((s, idx) => {
                  const active = idx === activeIndex;
                  return (
                    <div
                      key={s.key}
                      className={[
                        "absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-out",
                        active ? "opacity-100" : "opacity-0",
                      ].join(" ")}
                      aria-hidden={!active}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.imageUrl}
                        alt={s.imageAlt}
                        className="max-h-[95%] w-auto object-contain rounded-xl shadow-xl scale-105 md:scale-110"
                      />
                    </div>
                  );
                })}
                <div className="absolute inset-0 ring-1 ring-black/5 pointer-events-none rounded-xl" />
              </div>
            </div>

            {/* Text (desktop left) */}
            <div className="order-2 md:order-1 w-full md:w-1/2">
              <div className="relative min-h-[240px]">
                {SLIDES.map((s, idx) => {
                  const active = idx === activeIndex;
                  return (
                    <div
                      key={s.key}
                      className={[
                        "absolute inset-0 transition-opacity duration-500 ease-out",
                        active ? "opacity-100" : "opacity-0 pointer-events-none",
                      ].join(" ")}
                      aria-hidden={!active}
                    >
                      <div className="text-3xl sm:text-5xl font-extrabold leading-tight text-gray-900">
                        {s.headline}
                      </div>
                      <div className="mt-4 text-base sm:text-lg leading-relaxed text-gray-700">
                        {s.subtext}
                      </div>
                      <div className="mt-7 flex flex-col sm:flex-row gap-4">
                        <Link
                          href={s.ctaHref}
                          className="inline-flex items-center justify-center rounded-xl bg-[#1DBF73] hover:bg-[#16a864] transition-colors text-white font-semibold px-6 py-3"
                        >
                          {s.ctaLabel}
                        </Link>
                        <Link
                          href={s.secondaryCtaHref}
                          className="inline-flex items-center justify-center rounded-xl bg-transparent hover:bg-[#E9F9F1] transition-colors text-[#1DBF73] font-semibold px-6 py-3 border border-[#1DBF73]"
                        >
                          {s.secondaryCtaLabel}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dots */}
              <div className="mt-7">
                <div className="flex gap-2">
                  {SLIDES.map((s, idx) => {
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => props.onChangeIndex(idx)}
                        className={[
                          "h-2.5 rounded-full transition-all duration-200",
                          active ? "w-8 bg-[#1DBF73]" : "w-2.5 bg-[#1DBF73]/30 hover:bg-[#1DBF73]/50",
                        ].join(" ")}
                        aria-label={`Go to slide ${idx + 1}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


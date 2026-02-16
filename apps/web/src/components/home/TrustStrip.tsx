"use client";

import React from "react";

function TipIcon(props: { text: string }) {
  return (
    <span className="relative inline-flex items-center group">
      <span
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#bfead4] bg-white/80 text-[10px] leading-none text-[#0b3d24]"
        aria-label="More info"
      >
        i
      </span>
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2",
          "whitespace-nowrap rounded-lg border border-[#bfead4] bg-white px-3 py-2",
          "text-xs font-medium text-gray-800 shadow-md opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100",
        ].join(" ")}
      >
        {props.text}
      </span>
    </span>
  );
}

function Item(props: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-[#0b3d24]">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 border border-[#bfead4]">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 10.5l3.2 3.2L16 5.9" />
        </svg>
      </span>
      <span className="flex items-center">{props.children}</span>
    </div>
  );
}

export function TrustStrip() {
  return (
    <section className="bg-[#E9F9F1] border-y border-[#d6f3e5]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Item>AI-Driven Competitive Pricing</Item>
          <Item>
            Contractors Earn 75–80%
            <TipIcon text="80% payout available for approved regional jobs." />
          </Item>
          <Item>Routers Earn 15%</Item>
          <Item>Triple-Approval Release</Item>
          <Item>Weekly Payouts</Item>
        </div>
      </div>
    </section>
  );
}


"use client";

import React from "react";

const BADGES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Money-Back Guarantee",
    description: "5 business day contractor connection guarantee.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Secure Payments",
    description: "Encrypted payment processing.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Fast Routing",
    description: "Jobs routed quickly to qualified contractors.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: "Local Community Focus",
    description: "Supporting local workers and businesses.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    title: "Transparent Payout Model",
    description: "Clear revenue splits — no hidden fees.",
  },
];

export function AssuranceBadges() {
  return (
    <section className="bg-[#E9F9F1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Built on Trust, Security & Transparency
          </h2>
        </div>
        <div className="flex flex-wrap justify-center gap-8 md:gap-10">
          {BADGES.map((b) => (
            <div
              key={b.title}
              className="flex flex-col items-center text-center max-w-[200px]"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/80 border border-[#bfead4] text-[#0b3d24] mb-3">
                {b.icon}
              </div>
              <h3 className="font-bold text-gray-900 text-sm">{b.title}</h3>
              <p className="mt-1 text-gray-600 text-xs">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

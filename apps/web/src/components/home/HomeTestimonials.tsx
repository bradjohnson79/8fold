"use client";

import React from "react";

const TESTIMONIALS = [
  {
    name: "Sarah M.",
    role: "Job Poster",
    quote:
      "No more bidding wars. I posted once, got a fair price, and had a contractor within days. Exactly what I needed.",
  },
  {
    name: "Daniel R.",
    role: "Job Poster",
    quote:
      "The escrow and triple-approval gave me peace of mind. I knew my money was protected until the job was done right.",
  },
  {
    name: "Carlos B.",
    role: "Contractor",
    quote:
      "Finally, clients without ads. Jobs come to me ready to go. I keep most of what I earn and 100% of tips.",
  },
  {
    name: "Amanda L.",
    role: "Contractor",
    quote:
      "The payout is real. Weekly deposits, no chasing invoices. This is how local work should work.",
  },
  {
    name: "Jason P.",
    role: "Router",
    quote:
      "I earn 15% just by connecting people in my community. It's flexible and actually pays.",
  },
  {
    name: "Priya S.",
    role: "Router",
    quote:
      "Simple system. I match jobs to contractors I know, and everyone wins. The platform handles the rest.",
  },
];

function QuoteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8 text-gray-200"
      fill="currentColor"
      aria-hidden
    >
      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
    </svg>
  );
}

export function HomeTestimonials() {
  return (
    <section className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            What Our Community Is Saying
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 relative"
            >
              <div className="absolute top-4 left-4">
                <QuoteIcon />
              </div>
              <p className="mt-6 text-gray-700 leading-relaxed">{t.quote}</p>
              <div className="mt-4">
                <p className="font-bold text-gray-900">{t.name}</p>
                <p className="text-sm text-8fold-green">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import React from "react";
import { Star } from "lucide-react";

const AVATAR_COLORS = [
  "bg-8fold-green",
  "bg-blue-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-teal-500",
];

const TESTIMONIALS = [
  {
    name: "Mike T.",
    role: "Contractor",
    city: "Los Angeles, CA",
    quote:
      "I signed up during the California launch phase. If the routing works the way they describe, this will change how contractors find work.",
  },
  {
    name: "Sarah M.",
    role: "Job Poster",
    city: "Austin, TX",
    quote:
      "No more bidding wars. I posted once, got a fair price, and had a contractor within days. Exactly what I needed.",
  },
  {
    name: "Daniel R.",
    role: "Job Poster",
    city: "Toronto, ON",
    quote:
      "The escrow and approval system gave me peace of mind. The contractor and I both confirm the job when it's done, so I know my payment is protected until the work is completed right.",
  },
  {
    name: "Carlos B.",
    role: "Contractor",
    city: "Phoenix, AZ",
    quote:
      "Finally, clients without ads. Jobs come to me ready to go. I keep most of what I earn and 100% of tips.",
  },
  {
    name: "Amanda L.",
    role: "Contractor",
    city: "Vancouver, BC",
    quote:
      "The payout is real. Weekly deposits, no chasing invoices. This is how local work should work.",
  },
  {
    name: "Jason P.",
    role: "Router",
    city: "Chicago, IL",
    quote:
      "I earn 15% just by connecting people in my community. It's flexible and actually pays.",
  },
  {
    name: "Priya S.",
    role: "Router",
    city: "Calgary, AB",
    quote:
      "Simple system. I match jobs to contractors I know, and everyone wins. The platform handles the rest.",
  },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export function HomeTestimonials() {
  return (
    <section className="bg-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            What Our Community Is Saying
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  aria-hidden="true"
                  className={`w-10 h-10 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
                >
                  <span aria-hidden="true">{initials(t.name)}</span>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{t.name}</p>
                  <p className="text-xs text-8fold-green font-medium">{t.role}</p>
                </div>
              </div>
              <div className="flex gap-0.5 text-yellow-400 mb-3" aria-label="5 out of 5 stars">
                {[...Array(5)].map((_, si) => (
                  <Star key={si} className="w-4 h-4 fill-current" aria-hidden="true" />
                ))}
              </div>
              <p className="text-gray-700 leading-relaxed">{t.quote}</p>
              {t.city && (
                <p className="text-xs text-gray-400 mt-3">{t.city}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

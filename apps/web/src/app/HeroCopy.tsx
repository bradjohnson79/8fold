"use client";

import { useEffect, useState } from "react";

type HeroVariant = {
  id: "A" | "B" | "C";
  headline: React.ReactNode;
  subheadline: React.ReactNode;
  supporting: string;
};

const HERO_VARIANTS: HeroVariant[] = [
  {
    id: "A",
    headline: (
      <>
        Contractors: Keep{" "}
        <span className="text-8fold-green-light">80%</span>{" "}
        of the Job Value
      </>
    ),
    subheadline:
      "Earn up to 85% on regional jobs. No lead fees. No bidding wars.",
    supporting:
      "8Fold connects contractors with verified local work across Canada and the United States through a fair-trade job marketplace.",
  },
  {
    id: "B",
    headline: (
      <>
        Stop Paying for Leads.{" "}
        <span className="text-8fold-green-light">Start Getting Real Jobs.</span>
      </>
    ),
    subheadline: (
      <>
        Join the marketplace where contractors keep{" "}
        <strong className="text-white">80% of every local job</strong> — up to 85% for regional work.
      </>
    ),
    supporting:
      "8Fold connects skilled contractors with verified local work while eliminating bidding wars and expensive lead platforms.",
  },
  {
    id: "C",
    headline: (
      <>
        Join the{" "}
        <span className="text-8fold-green-light">Fair-Trade</span>{" "}
        Job Marketplace for Contractors
      </>
    ),
    subheadline:
      "Get matched with real local jobs and keep the majority of the job value.",
    supporting:
      "8Fold is launching across Canada and the United States, connecting contractors with verified work through local routing and transparent payments.",
  },
];

export function HeroCopy() {
  // Start with Variant A for SSR — randomize after hydration to avoid mismatch.
  const [variant, setVariant] = useState<HeroVariant>(HERO_VARIANTS[0]);

  useEffect(() => {
    const idx = Math.floor(Math.random() * HERO_VARIANTS.length);
    const selected = HERO_VARIANTS[idx];
    setVariant(selected);
    console.log("Hero Variant:", selected.id);
  }, []);

  return (
    <>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
        {variant.headline}
      </h1>
      <p className="mt-5 text-xl font-semibold text-gray-200 max-w-xl leading-snug">
        {variant.subheadline}
      </p>
      <p className="mt-4 text-base text-gray-400 max-w-xl leading-relaxed">
        {variant.supporting}
      </p>
    </>
  );
}

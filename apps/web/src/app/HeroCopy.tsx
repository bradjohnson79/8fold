"use client";

export function HeroCopy() {
  return (
    <>
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-8fold-green/20 border border-8fold-green/30 text-8fold-green-light text-xs font-bold tracking-wider uppercase mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-8fold-green-light animate-pulse" />
        California Launch Beta
      </span>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
        <span className="text-8fold-green-light">California</span>{" "}
        Trade Network Launch
      </h1>
      <p className="mt-5 text-xl font-semibold text-gray-200 max-w-xl leading-snug">
        Connecting contractors with real local jobs without bidding, fees, or friction.
      </p>
      <p className="mt-4 text-base text-gray-400 max-w-xl leading-relaxed">
        Contractors secure consistent work. Job posters get fast, reliable project fulfillment.
      </p>
      <p className="mt-3 text-sm text-gray-500 max-w-xl leading-relaxed">
        We are building a trusted local trade network across California before statewide routing expands.
      </p>
    </>
  );
}

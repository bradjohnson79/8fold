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
        Contractor Launch Phase
      </h1>
      <p className="mt-5 text-xl font-semibold text-gray-200 max-w-xl leading-snug">
        Join the 8Fold network early and secure your place in the future of
        local trade work.
      </p>
      <p className="mt-4 text-base text-gray-400 max-w-xl leading-relaxed">
        Contractors keep 80% of local jobs and up to 85% for regional jobs.
        No lead fees. No bidding wars.
      </p>
      <p className="mt-3 text-sm text-gray-500 max-w-xl leading-relaxed">
        We are currently building our California contractor network before
        opening job posting statewide.
      </p>
    </>
  );
}

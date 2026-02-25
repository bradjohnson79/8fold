"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SignOutButton } from "@clerk/nextjs";

export function FullScreenSetupGate() {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[2147483647] h-screen w-screen bg-black/70">
      <div className="absolute right-4 top-4 z-[2147483648]">
        <SignOutButton>
          <button className="text-sm text-white hover:underline">Sign out</button>
        </SignOutButton>
      </div>
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Job Poster Setup</h1>
          <p className="mt-3 text-sm text-gray-600">
            You must complete your profile before accessing your dashboard.
          </p>
          <Link
            href="/job-poster/setup"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-8fold-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-8fold-green-dark"
          >
            Complete Setup
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function AuthShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const sp = useSearchParams();
  const next = sp.get("next");

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 mt-2">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <Link className="hover:text-8fold-green" href="/jobs">
                Back to jobs
              </Link>
              {next ? (
                <span className="text-gray-400">Continue to {next}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


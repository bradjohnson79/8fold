"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function readErrorMeta(err: unknown): { status: number | null; code: string } {
  const anyErr = err as any;
  const status = typeof anyErr?.status === "number" ? (anyErr.status as number) : null;
  const code = typeof anyErr?.code === "string" ? String(anyErr.code) : "";
  return { status, code };
}

function isAuthishError(err: unknown): boolean {
  const { status, code } = readErrorMeta(err);
  if (status === 401) return true;
  if (code.startsWith("AUTH_")) return true;
  return false;
}

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (!isAuthishError(error)) return;

    const qs = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    const next = `${pathname}${qs}`;
    const { status, code } = readErrorMeta(error);

    router.replace(`/login?next=${encodeURIComponent(next)}`);
    router.refresh();
  }, [error, pathname, router, searchParams]);

  const meta = readErrorMeta(error);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="border border-gray-200 rounded-2xl p-6">
          <div className="text-lg font-bold text-gray-900">Something went wrong</div>
          <div className="text-gray-600 mt-2 text-sm">
            {isAuthishError(error)
              ? "Refreshing your session…"
              : "Please try again. If this keeps happening, refresh the page."}
          </div>

          {process.env.NODE_ENV !== "production" ? (
            <div className="mt-4 text-xs font-mono text-gray-600 whitespace-pre-wrap break-words">
              {String(error?.message || "Error")}
              {meta.status != null ? `\nstatus=${meta.status}` : ""}
              {meta.code ? `\ncode=${meta.code}` : ""}
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-lg"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.replace("/app")}
              className="inline-flex bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-5 py-2.5 rounded-lg"
            >
              Go to app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


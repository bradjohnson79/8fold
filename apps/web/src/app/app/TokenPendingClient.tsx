"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

export function TokenPendingClient(props: { nextFallback?: string }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = React.useState(0);
  const [exhausted, setExhausted] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setSigningOut(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;

    // Bounded refresh loop: wait for Clerk to mint a usable API token.
    const schedule = async () => {
      const delaysMs = [80, 160, 260, 420, 700, 900] as const; // ~2.5s total
      for (let i = 0; i < delaysMs.length; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        await new Promise((r) => setTimeout(r, delaysMs[i]!));
        if (cancelled) return;

        router.refresh();
      }

      // No automatic /login bounce. If Clerk is having a persistent problem, surface a controlled UI.
      setExhausted(true);
    };

    void schedule();
    return () => {
      cancelled = true;
    };
  }, [pathname, props.nextFallback, router, searchParams]);

  const qs = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const next = `${pathname}${qs}`;
  const fallbackNext = props.nextFallback ?? next;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="max-w-md px-6 text-center">
        <div className="text-gray-900 font-bold text-lg">
          {exhausted ? "Session still loading" : "Finishing sign-in…"}
        </div>
        <div className="text-gray-600 font-semibold mt-2">
          {exhausted
            ? "Please try refreshing. If this keeps happening, sign out and sign in again."
            : `Attempt ${attempt || 1}…`}
        </div>
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="inline-flex bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <a
            href={`/login?next=${encodeURIComponent(fallbackNext)}`}
            className="inline-flex bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 font-semibold px-5 py-2.5 rounded-lg"
          >
            Go to login
          </a>
        </div>
      </div>
    </div>
  );
}


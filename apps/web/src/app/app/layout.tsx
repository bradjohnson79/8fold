import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side guard prevents client hydration races (no "blank until refresh").
  const { userId } = await auth();
  if (!userId) {
    redirect("/login?next=/app");
  }
  // Explicit suspense boundary for app shell (prevents "stuck blank" when a child suspends).
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-gray-600 font-semibold">Loading…</div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}


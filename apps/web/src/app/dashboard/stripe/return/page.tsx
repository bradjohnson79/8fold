"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function resolveTarget(roleParam: string | null): string {
  const role = String(roleParam ?? "").trim().toUpperCase();
  if (role === "ROUTER") {
    return "/dashboard/router/payments?stripe=return";
  }
  if (role === "CONTRACTOR") {
    return "/dashboard/contractor/payment?stripe=return";
  }
  return "/dashboard?stripe=return";
}

export default function StripeReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const target = useMemo(() => resolveTarget(searchParams.get("role")), [searchParams]);

  useEffect(() => {
    router.replace(target);
  }, [router, target]);

  return (
    <main className="mx-auto flex min-h-[40vh] w-full max-w-2xl items-center justify-center px-6 py-16">
      <p className="text-sm text-slate-600">Finalizing Stripe verification and returning you to your dashboard...</p>
    </main>
  );
}

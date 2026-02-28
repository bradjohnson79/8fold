"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

type Role = "JOB_POSTER" | "ROUTER" | "CONTRACTOR";

function isRole(value: string | null): value is Role {
  return value === "JOB_POSTER" || value === "ROUTER" || value === "CONTRACTOR";
}

export default function CompleteRegistrationPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/login?next=/auth/complete-registration");
      return;
    }

    const selectedRoleRaw = localStorage.getItem("selectedRole");
    if (!isRole(selectedRoleRaw)) {
      router.replace("/choose-role");
      return;
    }

    void (async () => {
      setError("");
      try {
        const resp = await fetch("/api/users/complete-registration", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: selectedRoleRaw }),
        });
        const json = (await resp.json().catch(() => null)) as any;
        if (!resp.ok || json?.ok !== true) {
          const msg = String(json?.error?.message ?? json?.error ?? "Could not complete registration.");
          throw new Error(msg);
        }
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not complete registration.");
      }
    })();
  }, [isLoaded, isSignedIn, router]);

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Finishing registration…</h1>
      <p className="mt-2 text-sm text-gray-600">
        We&apos;re preparing your account and assigning your selected role.
      </p>
      {error ? (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "JOB_POSTER" | "ROUTER" | "CONTRACTOR";

const ROLES: Array<{ value: Role; title: string; subtitle: string }> = [
  { value: "JOB_POSTER", title: "Job Poster", subtitle: "Post work and manage outcomes." },
  { value: "ROUTER", title: "Router", subtitle: "Coordinate jobs and route assignments." },
  { value: "CONTRACTOR", title: "Contractor", subtitle: "Take assignments and complete jobs." },
];

export default function ChooseRolePage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  function handleContinue() {
    if (!selectedRole) return;
    localStorage.setItem("selectedRole", selectedRole);
    router.push("/sign-up");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Choose your role</h1>
      <p className="mt-2 text-sm text-gray-600">Select your 8Fold role before creating your account.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {ROLES.map((role) => {
          const active = selectedRole === role.value;
          return (
            <button
              key={role.value}
              type="button"
              onClick={() => setSelectedRole(role.value)}
              className={
                "rounded-xl border p-4 text-left transition-colors " +
                (active
                  ? "border-8fold-green bg-emerald-50"
                  : "border-gray-200 bg-white hover:border-gray-300")
              }
            >
              <div className="text-base font-semibold text-gray-900">{role.title}</div>
              <div className="mt-1 text-sm text-gray-600">{role.subtitle}</div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selectedRole}
        onClick={handleContinue}
        className="mt-8 inline-flex rounded-lg bg-8fold-green px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        Continue to Sign Up
      </button>
    </div>
  );
}

"use client";

import { SignUp } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../../components/AuthShell";

type SignupRole = "contractor" | "job_poster" | "router";

const ROLE_OPTIONS: Array<{
  value: SignupRole;
  title: string;
  subtitle: string;
}> = [
  {
    value: "contractor",
    title: "Contractor",
    subtitle: "Get routed local jobs and protected payouts.",
  },
  {
    value: "job_poster",
    title: "Job Poster",
    subtitle: "Post projects and get matched quickly.",
  },
  {
    value: "router",
    title: "Router",
    subtitle: "Coordinate local jobs and earn routing income.",
  },
];

function isSignupRole(value: string | null): value is SignupRole {
  return value === "contractor" || value === "job_poster" || value === "router";
}

export default function SignupClient() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/auth/complete-registration";
  const [selectedRole, setSelectedRole] = useState<SignupRole | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("selectedRole") : null;
    if (isSignupRole(stored)) {
      setSelectedRole(stored);
    }
  }, []);

  function handleContinue() {
    if (!selectedRole) return;
    window.localStorage.setItem("selectedRole", selectedRole);
    setShowSignUp(true);
  }

  function handleChangeRole() {
    setShowSignUp(false);
  }

  return (
    <AuthShell
      title="Sign up"
      subtitle={
        showSignUp
          ? "Create your account to continue with your selected 8Fold role."
          : "Choose your path first, then create your account."
      }
    >
      {!showSignUp ? (
        <div>
          <div className="space-y-3">
            {ROLE_OPTIONS.map((role) => {
              const active = selectedRole === role.value;
              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  className={
                    "w-full rounded-xl border p-4 text-left transition-colors " +
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
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-8fold-green px-5 py-3 font-semibold text-white transition-colors hover:bg-8fold-green-dark disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Continue to Account Creation
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Selected role</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">
                {ROLE_OPTIONS.find((role) => role.value === selectedRole)?.title ?? "Contractor"}
              </div>
              <button
                type="button"
                onClick={handleChangeRole}
                className="text-sm font-semibold text-8fold-green hover:underline"
              >
                Change
              </button>
            </div>
          </div>
          <div className="flex justify-center">
            <SignUp path="/signup" routing="path" signInUrl="/login" fallbackRedirectUrl={next} />
          </div>
        </div>
      )}
    </AuthShell>
  );
}

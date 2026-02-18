"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../../components/AuthShell";

export default function SignupClient() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/onboarding/role";

  return (
    <AuthShell title="Sign up" subtitle="Create your account, then pick your 8Fold role.">
      <div className="flex justify-center">
        <SignUp path="/signup" routing="path" signInUrl="/login" fallbackRedirectUrl={next} />
      </div>
    </AuthShell>
  );
}


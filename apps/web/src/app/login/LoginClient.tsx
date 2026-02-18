"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../../components/AuthShell";

export default function LoginClient() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/app";

  return (
    <AuthShell title="Log in" subtitle="Continue with email OTP or a social provider.">
      <div className="flex justify-center">
        <SignIn path="/login" routing="path" signUpUrl="/signup" fallbackRedirectUrl={next} />
      </div>
    </AuthShell>
  );
}


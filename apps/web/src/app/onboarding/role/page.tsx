import { Suspense } from "react";
import RoleOnboardingClient from "./roleClient";

export default function RoleOnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <RoleOnboardingClient />
    </Suspense>
  );
}


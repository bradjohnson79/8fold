import { Suspense } from "react";
import SignupClient from "../SignupClient";

// Clerk App Router requirement: catch-all route for auth flows (/signup/*).
export default function SignupCatchAllPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <SignupClient />
    </Suspense>
  );
}


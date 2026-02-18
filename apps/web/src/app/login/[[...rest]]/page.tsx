import { Suspense } from "react";
import LoginClient from "../LoginClient";

// Clerk App Router requirement: catch-all route for auth flows (/login/*).
export default function LoginCatchAllPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <LoginClient />
    </Suspense>
  );
}


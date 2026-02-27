"use client";

import { SignIn } from "@clerk/nextjs";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <SignIn
        appearance={{
          elements: {
            card: "shadow-xl rounded-xl",
          },
        }}
      />
    </div>
  );
}

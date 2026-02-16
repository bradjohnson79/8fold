import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60vh" }} />}>
      <LoginClient />
    </Suspense>
  );
}


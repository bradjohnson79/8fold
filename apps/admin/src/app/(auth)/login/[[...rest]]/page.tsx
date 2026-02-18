import { Suspense } from "react";
import LoginClient from "../LoginClient";

export default function AdminLoginCatchAllPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "60vh" }} />}>
      <LoginClient />
    </Suspense>
  );
}


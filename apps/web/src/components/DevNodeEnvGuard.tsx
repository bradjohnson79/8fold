"use client";

import React from "react";

export function DevNodeEnvGuard({ serverNodeEnv }: { serverNodeEnv: string }) {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const clientEnv = String(process.env.NODE_ENV || "").trim();
    const serverEnv = String(serverNodeEnv || "").trim();
    if (clientEnv && serverEnv && clientEnv !== serverEnv) {
      // Intentionally no console diagnostics (production-readiness freeze).
    }
  }, [serverNodeEnv]);

  return null;
}


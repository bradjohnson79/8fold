import { Slot } from "expo-router";
import { attachAppStateSentinels } from "../src/auth/runtimeSentinels";
import React from "react";
import { SessionProvider } from "../src/auth/session";

export default function RootLayoutNav() {
  React.useEffect(() => {
    attachAppStateSentinels();
  }, []);

  return (
    <SessionProvider>
      <Slot />
    </SessionProvider>
  );
}


import * as SecureStore from "expo-secure-store";
import React from "react";

const KEY = "8fold.sessionToken";

type SessionState = {
  isLoaded: boolean;
  sessionToken: string | null;
  setSessionToken: (t: string) => Promise<void>;
  clearSession: () => Promise<void>;
};

const Ctx = React.createContext<SessionState | null>(null);

export function SessionProvider(props: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [sessionToken, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const t = await SecureStore.getItemAsync(KEY);
      if (!alive) return;
      setToken(t ?? null);
      setIsLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function setSessionToken(t: string) {
    await SecureStore.setItemAsync(KEY, t);
    setToken(t);
  }

  async function clearSession() {
    await SecureStore.deleteItemAsync(KEY);
    setToken(null);
  }

  return (
    <Ctx.Provider value={{ isLoaded, sessionToken, setSessionToken, clearSession }}>
      {props.children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useSession must be used within SessionProvider");
  return v;
}


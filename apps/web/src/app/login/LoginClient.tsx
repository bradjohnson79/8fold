"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "../../components/AuthShell";

type Step = "email" | "code";

type ApiResponse = {
  ok: boolean;
  error?: string;
  debugCode?: string;
  meta?: any;
  code?: any;
};

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/app";
  const isAdminMode = sp.get("admin") === "1";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapOtp, setBootstrapOtp] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [bootstrapStatus, setBootstrapStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [bootstrapMsg, setBootstrapMsg] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  // Keep validation intentionally permissive in dev; backend is the source of truth.
  const emailValid = useMemo(() => {
    const v = email.trim();
    return v.length >= 6 && v.includes("@") && v.includes(".");
  }, [email]);

  // Note: in some automated/browser-tool runs, controlled input `onChange` may not fire reliably.
  // We still validate using refs inside requestCode()/verify(), so keep buttons clickable.
  const emailUiValue = (email.trim() || emailRef.current?.value?.trim() || "").trim();
  const codeUiValue = (code.trim() || codeRef.current?.value?.trim() || "").trim();

  async function requestCode() {
    setLoading(true);
    setError("");
    setDebugCode(null);
    try {
      const emailToSend = (email.trim() || emailRef.current?.value?.trim() || "").trim();
      if (!emailToSend) throw new Error("Invalid input");
      const resp = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailToSend }),
      });

      let json: ApiResponse | null = null;
      try {
        json = (await resp.json()) as ApiResponse;
      } catch {
        throw new Error("Server returned invalid response.");
      }

      if (!resp.ok) {
        throw new Error(json?.error || `Server error (${resp.status})`);
      }

      if (json?.ok !== true) {
        throw new Error(json?.error || "Code request failed.");
      }

      if (json?.debugCode) setDebugCode(String(json.debugCode));
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError("");
    try {
      const tokenToSend = (code.trim() || codeRef.current?.value?.trim() || "").trim();
      if (!tokenToSend) throw new Error("Verification failed");
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: tokenToSend }),
      });

      let json: ApiResponse | null = null;
      try {
        json = (await resp.json()) as ApiResponse;
      } catch {
        throw new Error("Server returned invalid response.");
      }

      if (!resp.ok) {
        throw new Error(json?.error || `Server error (${resp.status})`);
      }

      if (json?.ok !== true) {
        throw new Error(json?.error || "Verification failed.");
      }

      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Enter your email to get a one-time code. We’ll keep you signed in with a secure session cookie."
    >
      {error ? (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      ) : null}

      {step === "email" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await requestCode();
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-8fold-green"
              ref={emailRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">One-time code</span>
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-8fold-green"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
            />
          </label>

          {debugCode ? (
            <div className="text-xs text-gray-500">
              Dev code: <span className="font-mono font-semibold">{debugCode}</span>
            </div>
          ) : null}

          <button
            onClick={() => void verify()}
            disabled={loading}
            className="w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>

          <button onClick={() => setStep("email")} className="w-full text-gray-600 hover:text-gray-900 font-medium py-2">
            Use a different email
          </button>
        </div>
      )}

      {isAdminMode ? (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">Create Admin Account</div>
              <div className="mt-1 text-xs text-gray-600">
                Hidden by default. Requires an admin bootstrap secret and a valid one-time code.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBootstrapOpen((v) => !v)}
              className="text-sm font-semibold text-8fold-green hover:text-8fold-green-dark"
            >
              {bootstrapOpen ? "Hide" : "Create Admin Account"}
            </button>
          </div>

          {bootstrapOpen ? (
            <div className="mt-4 space-y-3">
              {bootstrapStatus === "ok" ? (
                <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-lg text-sm">
                  Admin account enabled. Now log in normally with your email.
                </div>
              ) : null}
              {bootstrapStatus === "error" ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{bootstrapMsg}</div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-8fold-green"
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">One-time code</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-8fold-green"
                  value={bootstrapOtp}
                  onChange={(e) => setBootstrapOtp(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Admin signup secret</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-8fold-green"
                  value={bootstrapSecret}
                  onChange={(e) => setBootstrapSecret(e.target.value)}
                  placeholder="Paste secret"
                  autoComplete="off"
                />
              </label>

              <button
                type="button"
                disabled={bootstrapStatus === "loading"}
                onClick={() => {
                  void (async () => {
                    setBootstrapStatus("loading");
                    setBootstrapMsg("");
                    try {
                      const resp = await fetch("/api/bootstrap-admin", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          email: bootstrapEmail.trim(),
                          otpCode: bootstrapOtp.trim(),
                          secret: bootstrapSecret.trim(),
                        }),
                      });
                      if (!resp.ok) throw new Error("Unauthorized");
                      const json = await resp.json().catch(() => null);
                      if (!json || json.ok !== true) throw new Error("Unauthorized");
                      setBootstrapStatus("ok");
                      setBootstrapOpen(false);
                      // Help UX: prefill login email.
                      setEmail(bootstrapEmail.trim());
                      setStep("email");
                    } catch (e) {
                      setBootstrapStatus("error");
                      setBootstrapMsg("Unauthorized");
                    }
                  })();
                }}
                className="w-full bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg"
              >
                {bootstrapStatus === "loading" ? "Creating…" : "Create Admin Account"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </AuthShell>
  );
}


"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "../../components/AuthShell";

type Step = "signup" | "code";
type WebRole = "router" | "job-poster" | "contractor";

export default function SignupClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [step, setStep] = useState<Step>("signup");
  const presetRole = (sp.get("role") ?? "").toLowerCase();
  const initialRole =
    presetRole === "router" || presetRole === "contractor" || presetRole === "job-poster" ? (presetRole as WebRole) : "";
  const [role, setRole] = useState<WebRole | "">(initialRole);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  // Keep validation intentionally permissive in dev; backend is the source of truth.
  const emailValid = useMemo(() => {
    const v = email.trim();
    return v.length >= 6 && v.includes("@") && v.includes(".");
  }, [email]);
  const roleValid = useMemo(() => role === "router" || role === "job-poster" || role === "contractor", [role]);

  async function requestCode() {
    setLoading(true);
    setError("");
    setDebugCode(null);
    try {
      if (!roleValid) {
        setError("Select a role to continue.");
        return;
      }
      const emailToSend = (email.trim() || emailRef.current?.value?.trim() || "").trim();
      if (!emailToSend) throw new Error("Invalid input");
      const resp = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailToSend }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((json as any)?.error || "Could not send code");
      if ((json as any)?.ok === false) {
        throw new Error(
          String((json as any)?.meta?.message || (json as any)?.code || "Could not send code")
        );
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
        body: JSON.stringify({ token: tokenToSend, role }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Verification failed");
      router.replace(`/app/${role}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Sign up" subtitle="Choose your role and verify your email. Your role is locked after signup.">
      {error ? (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
      ) : null}

      {step === "signup" ? (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Role (required)</span>
            <select
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-8fold-green"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="">Select role…</option>
              <option value="router">Router</option>
              <option value="job-poster">Job Poster</option>
              <option value="contractor">Contractor</option>
            </select>
            {!roleValid ? (
              <div className="mt-2 text-sm text-amber-700">Select a role to continue.</div>
            ) : null}
          </label>

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
            onClick={() => void requestCode()}
            disabled={loading || !roleValid}
            className="w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? "Sending…" : "Send verification code"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Role: <span className="font-semibold text-gray-900">{roleValid ? role.replace("-", " ") : ""}</span>
          </div>

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
            className="w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? "Verifying…" : "Create account"}
          </button>

          <button onClick={() => setStep("signup")} className="w-full text-gray-600 hover:text-gray-900 font-medium py-2">
            Back
          </button>
        </div>
      )}
    </AuthShell>
  );
}


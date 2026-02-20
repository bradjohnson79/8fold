"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "JOB_POSTER" | "CONTRACTOR" | "ROUTER";

function roleToPath(role: Role): string {
  if (role === "ROUTER") return "/app/router";
  if (role === "CONTRACTOR") return "/app/contractor";
  return "/app/job-poster";
}

export default function RoleOnboardingClient() {
  const router = useRouter();
  const [role, setRole] = useState<Role | "">("");
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // If the user already has a role assigned, go to the correct root.
  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch("/api/app/me", { method: "GET" });
        const json = (await resp.json().catch(() => null)) as any;
        if (resp.status === 401) {
          router.replace("/login?next=/onboarding/role");
          return;
        }
        if (resp.ok && json?.ok === true && typeof json?.role === "string") {
          const r = String(json.role).toUpperCase();
          if (r === "ROUTER") router.replace("/app/router");
          if (r === "CONTRACTOR") router.replace("/app/contractor");
          if (r === "JOB_POSTER") router.replace("/app/job-poster");
        }
      } catch {
        // Non-blocking: allow users to continue role selection when pre-check fails.
        setInfo("We could not verify your existing role right now. You can still continue.");
      }
    })();
  }, [router]);

  const canSubmit = useMemo(
    () => (role === "JOB_POSTER" || role === "CONTRACTOR" || role === "ROUTER") && ack,
    [role, ack],
  );

  async function submit() {
    setLoading(true);
    setError("");
    try {
      if (!canSubmit) throw new Error("Select a role");
      const resp = await fetch("/api/app/onboarding/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = (await resp.json().catch(() => null)) as any;
      if (!resp.ok || json?.ok !== true) {
        const msg = String(json?.error?.message ?? json?.error ?? "Failed to assign role");
        throw new Error(msg);
      }
      const selected = role as Role;
      router.replace(roleToPath(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Choose your role</h1>
      <p className="mt-2 text-sm text-gray-600">
        This selection is permanent and cannot be changed later. If you need a different role, create a new Clerk account.
      </p>

      {error ? (
        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
      ) : null}
      {info ? (
        <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">{info}</div>
      ) : null}

      <div className="mt-6 space-y-3">
        <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-3">
          <input type="radio" name="role" value="JOB_POSTER" checked={role === "JOB_POSTER"} onChange={() => setRole("JOB_POSTER")} />
          <span className="font-medium text-gray-900">Job Poster</span>
        </label>
        <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-3">
          <input type="radio" name="role" value="ROUTER" checked={role === "ROUTER"} onChange={() => setRole("ROUTER")} />
          <span className="font-medium text-gray-900">Router</span>
        </label>
        <label className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-3">
          <input type="radio" name="role" value="CONTRACTOR" checked={role === "CONTRACTOR"} onChange={() => setRole("CONTRACTOR")} />
          <span className="font-medium text-gray-900">Contractor</span>
        </label>

        <label className="mt-3 flex items-start gap-3 border border-gray-200 rounded-lg px-3 py-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(Boolean(e.target.checked))}
            className="mt-1"
          />
          <span>
            I understand this cannot be changed later.
          </span>
        </label>

        <button
          disabled={!canSubmit || loading}
          onClick={() => void submit()}
          className="w-full bg-8fold-green hover:bg-8fold-green-dark disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg"
        >
          {loading ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}


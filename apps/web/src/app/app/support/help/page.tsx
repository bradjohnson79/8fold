"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";

type Category =
  | "PRICING"
  | "JOB_POSTING"
  | "ROUTING"
  | "CONTRACTOR"
  | "PAYOUTS"
  | "OTHER";

type RoleContext = "JOB_POSTER" | "ROUTER" | "CONTRACTOR";

function roleContextFromWebRole(webRole: string | null): RoleContext {
  if (webRole === "router") return "ROUTER";
  if (webRole === "contractor") return "CONTRACTOR";
  return "JOB_POSTER";
}

export default function GetHelpPage() {
  const router = useRouter();
  const path = usePathname();
  const base = (() => {
    const idx = path.indexOf("/support");
    if (idx < 0) return "/app/support";
    return path.slice(0, idx) + "/support";
  })();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [role, setRole] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const resp = await fetch("/api/app/me", { cache: "no-store" });
      const json = (await resp.json().catch(() => null)) as any;
      if (!alive) return;
      setRole(json?.role ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [category, setCategory] = React.useState<Category>("OTHER");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");

  async function submit() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const body = {
        type: "HELP",
        category,
        priority: "NORMAL",
        roleContext: roleContextFromWebRole(role),
        subject: subject.trim(),
        message: message.trim(),
      };
      if (!body.subject || !body.message) throw new Error("Please fill subject and message.");

      const resp = await fetch("/api/app/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error ?? "Failed to create ticket");

      const ticketId = json?.ticket?.id as string | undefined;
      setNotice("Submitted.");
      if (ticketId) router.push(`${base}/tickets/${ticketId}`);
      else router.push(`${base}/history`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">🆘 Get Help</h2>
        <p className="text-gray-600 mt-1">Create a private support ticket. A human will respond as soon as possible.</p>
      </div>

      {error ? <div className="text-red-600 font-semibold">{error}</div> : null}
      {notice ? <div className="text-8fold-green font-semibold">{notice}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm font-medium text-gray-700">Category</div>
          <select
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            <option value="PRICING">Pricing</option>
            <option value="JOB_POSTING">Job posting</option>
            <option value="ROUTING">Routing</option>
            <option value="CONTRACTOR">Contractor work</option>
            <option value="PAYOUTS">Payouts</option>
            <option value="OTHER">Other</option>
          </select>
        </label>

        <label className="block">
          <div className="text-sm font-medium text-gray-700">Subject</div>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            placeholder="Short summary"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
          />
        </label>
      </div>

      <label className="block">
        <div className="text-sm font-medium text-gray-700">Message</div>
        <textarea
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[140px]"
          placeholder="Tell us what happened and what you need."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={loading}
          className="bg-8fold-green text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {loading ? "Submitting..." : "Submit ticket"}
        </button>
        <div className="text-gray-500 text-sm">You can follow up any time in your Support history.</div>
      </div>
    </div>
  );
}


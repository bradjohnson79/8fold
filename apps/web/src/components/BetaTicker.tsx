"use client";

import { useEffect, useMemo, useState } from "react";

type TickerMessage = {
  id: string;
  message: string;
  displayOrder: number;
  intervalSeconds: number;
};

const FALLBACK_MESSAGE: TickerMessage = {
  id: "fallback",
  message: "California Launch Beta — Building the Founding Contractor Network",
  displayOrder: 1,
  intervalSeconds: 6,
};

export function BetaTicker() {
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const apiOrigin = useMemo(() => {
    const explicit = String(process.env.NEXT_PUBLIC_API_ORIGIN ?? "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return "http://localhost:3003";
    }
    return "https://api.8fold.app";
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch(`${apiOrigin}/api/web/v4/frontpage-ticker`);
        const data = await resp.json();
        if (!cancelled && data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        } else if (!cancelled) {
          setMessages([FALLBACK_MESSAGE]);
        }
      } catch {
        if (!cancelled) setMessages([FALLBACK_MESSAGE]);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [apiOrigin]);

  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = (messages[currentIndex]?.intervalSeconds ?? 6) * 1000;

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, interval);

    return () => clearTimeout(timer);
  }, [messages, currentIndex]);

  if (messages.length === 0) return null;

  const current = messages[currentIndex] ?? messages[0];

  return (
    <div className="bg-slate-900 text-white text-sm py-2 text-center overflow-hidden">
      <div
        className="flex items-center justify-center gap-2 px-4 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="inline-block border border-green-500 text-green-400 text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap">
          BETA
        </span>
        <span>{current.message}</span>
      </div>
    </div>
  );
}

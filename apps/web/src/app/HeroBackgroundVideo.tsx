"use client";

import { useEffect, useRef, useState } from "react";

const HERO_VIDEO_PATH = process.env.NEXT_PUBLIC_HERO_VIDEO_PATH || "/hero-video.mp4";
const HERO_VIDEO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_HERO_VIDEO === "1";

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);

  useEffect(() => {
    if (!HERO_VIDEO_ENABLED) return;
    const reduced = prefersReducedMotionNow();
    setReducedMotion(reduced);
    if (reduced) return;

    let cancelled = false;
    // Detect missing asset early so we can render a stable fallback instead of a broken video element.
    void (async () => {
      try {
        const resp = await fetch(HERO_VIDEO_PATH, { method: "HEAD", cache: "no-store" });
        if (cancelled) return;
        if (!resp.ok) {
          setVideoUnavailable(true);
          return;
        }
        setVideoReady(true);
      } catch {
        if (!cancelled) setVideoUnavailable(true);
      }
    })();

    // Optional enhancement: persist pause choice for this visit.
    const saved = sessionStorage.getItem("heroVideoPaused");
    if (saved === "true") {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleVideo() {
    const el = videoRef.current;
    if (!el) return;

    try {
      if (isPlaying) {
        el.pause();
        sessionStorage.setItem("heroVideoPaused", "true");
        setIsPlaying(false);
      } else {
        // Some browsers return a promise; ignore failures (e.g. user gesture policies).
        await Promise.resolve(el.play()).catch(() => undefined);
        sessionStorage.setItem("heroVideoPaused", "false");
        setIsPlaying(true);
      }
    } catch {
      // no-op (avoid console noise)
    }
  }

  // Guard: don't render video (or button) when reduced motion is requested.
  if (!HERO_VIDEO_ENABLED) return null;
  if (reducedMotion) return null;

  return (
    <>
      {videoUnavailable || !videoReady ? (
        // Fallback stabilization: animated gradient layer when video asset is unavailable.
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0c1c2f] via-[#112844] to-[#0f2035]" />
          <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-emerald-400/12 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute -bottom-24 -right-24 w-[26rem] h-[26rem] rounded-full bg-cyan-300/10 blur-3xl animate-[pulse_10s_ease-in-out_infinite]" />
          <div className="absolute inset-0 bg-gradient-to-b from-8fold-navy/60 via-8fold-navy/40 to-8fold-navy/80" />
        </div>
      ) : (
        /* Background video layer (does not affect layout; no CLS) */
        <div className="absolute inset-0 z-0 pointer-events-none">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoUnavailable(true)}
          >
            <source src={HERO_VIDEO_PATH} type="video/mp4" />
          </video>

          {/* Preserve readability over video. */}
          <div className="absolute inset-0 bg-gradient-to-b from-8fold-navy/70 via-8fold-navy/45 to-8fold-navy/80" />
        </div>
      )}

      {/* Play/Pause control */}
      {videoReady && !videoUnavailable ? (
        <div className="absolute bottom-6 right-6 z-20">
          <button
            onClick={toggleVideo}
            aria-label={isPlaying ? "Pause background video" : "Play background video"}
            className="
            w-12 h-12
            rounded-full
            backdrop-blur-md
            bg-white/10
            border border-white/20
            flex items-center justify-center
            text-white
            hover:bg-white/20
            transition
            shadow-lg
          "
          >
            {isPlaying ? (
              <svg width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
                <rect x="3" y="2" width="5" height="16" rx="1" />
                <rect x="12" y="2" width="5" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
                <polygon points="3,2 18,10 3,18" />
              </svg>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}


/**
 * Safe Meta Pixel event tracking.
 * Use this instead of calling fbq() directly to avoid "Cannot read properties of undefined" errors
 * when the pixel script hasn't loaded yet.
 */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackMetaEvent(event: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const fbq = (window as Window).fbq;
  if (!fbq) return;
  try {
    if (data) {
      fbq("track", event, data);
    } else {
      fbq("track", event);
    }
  } catch {
    // Silently ignore if pixel not ready
  }
}

"use client";

import { useEffect } from "react";

const KEY = "admin_theme";

function normalizeTheme(v: string | null): "dark" | "light" {
  return v === "light" ? "light" : "dark";
}

export function ThemeInit() {
  useEffect(() => {
    const theme = normalizeTheme(window.localStorage.getItem(KEY));
    document.documentElement.dataset.theme = theme;

    function onStorage(e: StorageEvent) {
      if (e.key !== KEY) return;
      document.documentElement.dataset.theme = normalizeTheme(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}

export function setAdminTheme(theme: "dark" | "light") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function getAdminTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return normalizeTheme(window.localStorage.getItem(KEY));
}


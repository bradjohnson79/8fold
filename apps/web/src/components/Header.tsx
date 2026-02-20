'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from "next/navigation"

export function Header() {
  const pathname = usePathname()
  const [workersOpen, setWorkersOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileWorkersOpen, setMobileWorkersOpen] = useState(false)
  const isAuthenticated = false

  const workersRef = useRef<HTMLDivElement | null>(null)

  // Dashboard pages have their own shell; keep the public header off dashboard routes.
  // IMPORTANT: do not early-return before all hooks run (React hook order must be stable).
  const hideOnAppRoutes = (pathname ?? "").startsWith("/app")

  const active = useMemo(() => {
    const p = pathname || "/"
    return {
      howToEarn: p === "/how-to-earn",
      about: p === "/about-8fold",
      workers: p.startsWith("/workers"),
      workersJobPosters: p.startsWith("/workers/job-posters"),
      workersRouters: p.startsWith("/workers/routers"),
      workersContractors: p.startsWith("/workers/contractors"),
    }
  }, [pathname])

  useEffect(() => {
    if (hideOnAppRoutes) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      setWorkersOpen(false)
      setMobileOpen(false)
      setMobileWorkersOpen(false)
    }

    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null
      if (workersRef.current && t && workersRef.current.contains(t)) return
      setWorkersOpen(false)
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onMouseDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onMouseDown)
    }
  }, [hideOnAppRoutes])

  if (hideOnAppRoutes) return null

  return (
    <header className="bg-8fold-navy text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img
                src="/images/8fold_site_logo.gif"
                alt="8Fold"
                className="h-10 w-auto"
              />
              <span className="sr-only">8Fold</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link
              href="/how-to-earn"
              className={
                active.howToEarn
                  ? "text-white font-semibold transition-colors"
                  : "text-gray-200 hover:text-white font-semibold transition-colors"
              }
            >
              How To Earn $$$
            </Link>

            <div className="relative" ref={workersRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={workersOpen}
                onClick={() => {
                  setWorkersOpen((v) => !v)
                }}
                className={
                  active.workers
                    ? "text-white font-semibold transition-colors inline-flex items-center gap-2"
                    : "text-gray-200 hover:text-white font-semibold transition-colors inline-flex items-center gap-2"
                }
              >
                Workers <span aria-hidden>▾</span>
              </button>

              {workersOpen ? (
                <div
                  role="menu"
                  aria-label="Workers"
                  className="absolute left-0 mt-2 w-72 bg-8fold-navy border border-white/10 rounded-xl shadow-xl p-2 z-50"
                >
                  <DropdownItem
                    href="/workers/job-posters"
                    title="Job Posters"
                    subtitle="Post once, get protected outcomes"
                    active={active.workersJobPosters}
                    onClick={() => setWorkersOpen(false)}
                  />
                  <DropdownItem
                    href="/workers/routers"
                    title="Routers"
                    subtitle="Coordinate jobs and earn 15%"
                    active={active.workersRouters}
                    onClick={() => setWorkersOpen(false)}
                  />
                  <DropdownItem
                    href="/workers/contractors"
                    title="Contractors"
                    subtitle="Get routed work, keep 75% + tips"
                    active={active.workersContractors}
                    onClick={() => setWorkersOpen(false)}
                  />
                </div>
              ) : null}
            </div>

            <Link
              href="/about-8fold"
              className={
                active.about
                  ? "text-white font-semibold transition-colors"
                  : "text-gray-200 hover:text-white font-semibold transition-colors"
              }
            >
              About 8Fold
            </Link>
          </nav>

          {/* Auth Button */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-8fold-green rounded-full"></div>
              </div>
            ) : (
              <>
                <Link
                  href="/sign-up"
                  className="hidden md:inline-flex bg-white text-8fold-navy px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                  Sign Up
                </Link>

                <Link 
                  href="/login"
                  className="bg-white text-8fold-navy px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                  Log In
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="md:hidden pb-4">
            <div className="mt-2 border-t border-white/10 pt-3 space-y-2">
              <Link
                href="/how-to-earn"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white font-semibold"
              >
                How To Earn $$$
              </Link>

              <button
                type="button"
                onClick={() => setMobileWorkersOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white font-semibold"
                aria-expanded={mobileWorkersOpen}
              >
                Workers <span aria-hidden>{mobileWorkersOpen ? "▴" : "▾"}</span>
              </button>
              {mobileWorkersOpen ? (
                <div className="pl-3 space-y-1">
                  <Link
                    href="/workers/job-posters"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white"
                  >
                    Job Posters
                  </Link>
                  <Link
                    href="/workers/routers"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white"
                  >
                    Routers
                  </Link>
                  <Link
                    href="/workers/contractors"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white"
                  >
                    Contractors
                  </Link>
                </div>
              ) : null}

              <Link
                href="/about-8fold"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-gray-200 hover:bg-white/10 hover:text-white font-semibold"
              >
                About 8Fold
              </Link>

              <Link
                href="/sign-up"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg bg-white text-8fold-navy font-semibold"
              >
                Sign Up
              </Link>

              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg bg-white text-8fold-navy font-semibold"
              >
                Log In
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function DropdownItem({
  href,
  title,
  subtitle,
  active,
  onClick,
}: {
  href: string;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={
        active
          ? "block rounded-lg px-3 py-2 bg-white/10 transition-colors"
          : "block rounded-lg px-3 py-2 hover:bg-white/10 transition-colors"
      }
    >
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="text-xs text-gray-200 mt-0.5">{subtitle}</div>
    </Link>
  )
}
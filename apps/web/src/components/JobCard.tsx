'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { formatMoney, getRevenueSplit } from '@8fold/shared'
import { FlagJobModal } from './jobs/FlagJobModal'

interface JobCardProps {
  job: {
    id: string
    title: string
    region: string
    serviceType: string
    tradeCategory?: string
    country?: 'US' | 'CA'
    currency?: 'USD' | 'CAD'
    timeWindow?: string
    isMock?: boolean
    amountCents?: number
    routerEarningsCents?: number
    brokerFeeCents?: number
    contractorPayoutCents?: number
    laborTotalCents?: number
    materialsTotalCents?: number
    transactionFeeCents?: number
    regionalFeeCents?: number
    status: string
    image?: string
    imageUrl?: string
    updatedAt?: string
  }
  isAuthenticated?: boolean
  livePreview?: boolean
}

export function JobCard({ job, isAuthenticated = false, livePreview = false }: JobCardProps) {
  const [imageError, setImageError] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagToast, setFlagToast] = useState<string | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const tradeBadge = job.tradeCategory ? job.tradeCategory.replace(/_/g, ' ') : null
  const currency = (job.currency ?? (job.country === 'CA' ? 'CAD' : 'USD')) as 'USD' | 'CAD'

  const split = getRevenueSplit(Boolean(job.regionalFeeCents))

  const computed = useMemo(() => {
    const materials = Number.isFinite(job.materialsTotalCents as any) ? (job.materialsTotalCents ?? 0) : 0
    const rev = getRevenueSplit(Boolean(job.regionalFeeCents))

    const amountCents = Number.isFinite(job.amountCents) && (job.amountCents ?? 0) > 0
      ? (job.amountCents ?? 0)
      : null

    if (amountCents !== null) {
      const contractorCents = Math.floor(amountCents * rev.contractor)
      const routerCents     = Math.floor(amountCents * rev.router)
      const platformCents   = amountCents - contractorCents - routerCents
      return {
        totalCents: amountCents,
        routerCents,
        contractorCents,
        platformCents,
        materialsCents: materials,
      }
    }

    const labor = Number.isFinite(job.laborTotalCents as any) ? (job.laborTotalCents ?? null) : null
    const fallbackTotal =
      (job.contractorPayoutCents ?? 0) +
      (job.routerEarningsCents ?? 0) +
      (job.brokerFeeCents ?? 0)

    const totalCents =
      labor !== null ? labor : (fallbackTotal > 0 ? fallbackTotal : null)

    const contractorCents = labor !== null ? Math.floor(labor * rev.contractor) : (job.contractorPayoutCents ?? 0)
    const routerCents     = labor !== null ? Math.floor(labor * rev.router)     : (job.routerEarningsCents ?? 0)
    const platformCents   =
      labor !== null ? (labor - contractorCents - routerCents) : (job.brokerFeeCents ?? 0)

    return {
      totalCents,
      routerCents,
      contractorCents,
      platformCents,
      materialsCents: materials,
    }
  }, [job])

  // Extract city + province from region.
  // Backend stores region as a slug like "kelowna-bc" or "austin-tx" in many places.
  // Support both "City, ST" and "city-st" formats.
  function titleCase(s: string) {
    return s
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  }

  let city = job.region
  let province = ""
  if (job.region.includes(", ")) {
    const parts = job.region.split(", ")
    city = parts[0] ?? job.region
    province = parts[1] ?? ""
  } else if (job.region.includes("-")) {
    const parts = job.region.split("-").filter(Boolean)
    province = (parts[parts.length - 1] ?? "").toUpperCase()
    city = titleCase(parts.slice(0, -1).join(" "))
  }

  // Determine status badge
  const getStatusBadge = () => {
    const s = (job.status || 'PUBLISHED').toUpperCase()
    if (s === 'OPEN_FOR_ROUTING' || s === 'IN_PROGRESS' || s === 'PUBLISHED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500 text-white">
          In Progress
        </span>
      )
    }
    if (s === 'ASSIGNED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Contractor Assigned
        </span>
      )
    }
    if (s === 'COMPLETED' || s === 'COMPLETED_APPROVED' || s === 'CUSTOMER_APPROVED' || s === 'CONTRACTOR_COMPLETED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
          Completed
        </span>
      )
    }
    if (s === 'CANCELLED' || s === 'ASSIGNED_CANCEL_PENDING') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Cancelled
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Pending
      </span>
    )
  }

  function categoryLabel(): string {
    const raw = (job.tradeCategory ?? '').trim()
    if (raw) return raw.replace(/_/g, ' ')
    return (job.serviceType ?? 'Job').trim()
  }

  // Fallback image when no photo_urls/image/imageUrl. Maps trade_category to /images/jobs/{category}/{category}1.png
  const TRADE_IMAGE_FOLDERS = new Set(['carpentry', 'drywall', 'electrical', 'furniture_assembly', 'janitorial', 'junk_removal', 'landscaping', 'moving', 'plumbing', 'roofing'])
  const tradeFolder = (job.tradeCategory ?? 'handyman').toLowerCase().replace(/-/g, '_')
  const fallbackImagePath = TRADE_IMAGE_FOLDERS.has(tradeFolder)
    ? `/images/jobs/${tradeFolder}/${tradeFolder}1.png`
    : '/images/jobs/moving/moving1.png'

  const imageSrc = (job.image ?? job.imageUrl) || fallbackImagePath

  function categoryIcon(): string {
    const v = `${(job.tradeCategory ?? '').toLowerCase()} ${(job.serviceType ?? '').toLowerCase()}`
    if (v.includes('elect')) return '⚡'
    if (v.includes('plumb')) return '🚰'
    if (v.includes('roof')) return '🏠'
    if (v.includes('drywall')) return '🧱'
    if (v.includes('carp')) return '🪚'
    if (v.includes('land')) return '🌿'
    if (v.includes('junk')) return '🗑️'
    if (v.includes('move')) return '🚚'
    if (v.includes('janitorial') || v.includes('clean')) return '🧽'
    if (v.includes('furniture') || v.includes('assemble')) return '🪑'
    return '🔧'
  }

  const showTime = !job.isMock
  const estimatedTime = showTime ? (job.timeWindow || "1-2 hours") : ""

  useEffect(() => {
    if (!livePreview) return
    const timer = window.setInterval(() => setNowTs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [livePreview])

  function relativeUpdatedLabel(): string | null {
    if (!livePreview) return null
    const source = job.updatedAt
    if (!source) return "Updated recently"
    const ts = new Date(source).getTime()
    if (!Number.isFinite(ts)) return "Updated recently"
    const secondsAgo = Math.max(0, Math.floor((nowTs - ts) / 1000))
    if (secondsAgo < 60) return `Updated ${secondsAgo}s ago`
    const minutesAgo = Math.floor(secondsAgo / 60)
    if (minutesAgo < 60) return `Updated ${minutesAgo}m ago`
    return "Updated recently"
  }

  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300 ${livePreview ? 'group' : ''}`}>
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-bold text-gray-900 leading-tight">{job.title}</h3>
          <div className="flex items-center gap-2">
            {livePreview ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                <span className="live-preview-dot" aria-hidden="true" />
                Live
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setFlagOpen(true)}
              className="text-red-500 hover:text-red-600"
              aria-label="Flag this job"
              disabled={flagSubmitting}
              title="Flag this job"
            >
              🚩
            </button>
            {getStatusBadge()}
          </div>
        </div>
        {tradeBadge ? (
          <div className="mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
              {tradeBadge}
            </span>
          </div>
        ) : null}
        <div className="flex items-center text-gray-600 text-sm">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          {city}, {province}
          {showTime ? <span className="ml-2">• {estimatedTime}</span> : null}
        </div>
        {relativeUpdatedLabel() ? (
          <div className="mt-2 text-sm text-gray-500">{relativeUpdatedLabel()}</div>
        ) : null}
      </div>

      <FlagJobModal
        open={flagOpen}
        jobTitle={job.title}
        onClose={() => {
          if (flagSubmitting) return
          setFlagOpen(false)
        }}
        onSubmit={async (reason) => {
          setFlagSubmitting(true)
          try {
            const resp = await fetch('/api/public/jobs/flag', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jobId: job.id, reason }),
            })
            const json = await resp.json().catch(() => ({}))
            if (!resp.ok || json?.ok === false) {
              throw new Error(json?.error ?? 'Failed to submit flag')
            }
            setFlagToast('Flag submitted. Thank you.')
            setTimeout(() => setFlagToast(null), 2500)
          } finally {
            setFlagSubmitting(false)
          }
        }}
      />

      {flagToast ? (
        <div className="fixed bottom-4 right-4 z-[60] rounded-xl bg-gray-900 text-white px-4 py-2 shadow-xl text-sm font-semibold">
          {flagToast}
        </div>
      ) : null}

      {/* Image */}
      <div className="px-6">
        <div className="relative h-48 bg-gray-100 rounded-xl overflow-hidden">
          {imageSrc && !imageError ? (
            <Image
              src={imageSrc}
              alt={job.title}
              fill
              className="object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-300" />
              <div className="relative text-center px-6">
                <div className="text-5xl mb-3">{categoryIcon()}</div>
                <div className="text-lg font-extrabold tracking-wide text-gray-800">
                  {categoryLabel()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Money (always visible) */}
      <div className="p-6">
        <div className="flex items-center mb-3">
          <svg className="w-5 h-5 text-8fold-green mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"/>
          </svg>
          <h4 className="font-semibold text-gray-900">Money</h4>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-900 font-bold border-b border-gray-100 pb-1 mb-2">
            <span>Job Total:</span>
            <span>
              {computed.totalCents !== null && computed.totalCents !== undefined
                ? formatMoney(computed.totalCents, currency)
                : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center bg-8fold-green bg-opacity-10 px-3 py-2 rounded-lg">
            <span className="text-8fold-green font-medium">
              Router Earns ({(split.router * 100).toFixed(0)}% of labor):
            </span>
            <span className="text-8fold-green font-bold text-lg">
              {formatMoney(computed.routerCents, currency)}
            </span>
          </div>

          <div className="flex justify-between text-sm text-gray-700 px-1">
            <span className="font-medium">
              Contractor Receives ({(split.contractor * 100).toFixed(0)}% of labor):
            </span>
            <span className="font-semibold">
              {formatMoney(computed.contractorCents, currency)}
            </span>
          </div>

          <div className="flex justify-between text-xs text-gray-500 px-1">
            <span>Platform Fee ({(split.platform * 100).toFixed(0)}% of labor):</span>
            <span>
              {formatMoney(computed.platformCents, currency)}
            </span>
          </div>
          {computed.materialsCents > 0 ? (
            <div className="flex justify-between text-xs text-gray-500 px-1">
              <span>Materials (escrow, 100% → contractor):</span>
              <span>{formatMoney(computed.materialsCents, currency)}</span>
            </div>
          ) : null}
        </div>

        {/* CTA Button */}
        <div className="mt-6">
          {(() => {
            const s = String(job.status ?? "").toUpperCase()

            // Routing is underway — job is not available to claim.
            if (s === "OPEN_FOR_ROUTING" || s === "IN_PROGRESS" || s === "PUBLISHED") {
              return (
                <button
                  disabled
                  className={`w-full bg-orange-500 text-white font-bold py-3 px-4 rounded-lg cursor-not-allowed tracking-wide opacity-90 ${livePreview ? 'live-preview-routing group-hover:opacity-100' : ''}`}
                >
                  {livePreview ? 'Routing in Progress' : 'ROUTING IN PROGRESS'}
                </button>
              )
            }

            // Contractor has been matched.
            if (s === "ASSIGNED" || s === "JOB_STARTED") {
              return (
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-4 rounded-lg cursor-not-allowed"
                >
                  Contractor Assigned
                </button>
              )
            }

            // Terminal states.
            if (s === "COMPLETED" || s === "COMPLETED_APPROVED" || s === "CUSTOMER_APPROVED" || s === "CONTRACTOR_COMPLETED") {
              return (
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-4 rounded-lg cursor-not-allowed"
                >
                  Job Completed
                </button>
              )
            }

            if (s === "CANCELLED" || s === "ASSIGNED_CANCEL_PENDING") {
              return (
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-4 rounded-lg cursor-not-allowed"
                >
                  Job Cancelled
                </button>
              )
            }

            // Fallback for any unhandled status.
            return (
              <button
                disabled
                className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-4 rounded-lg cursor-not-allowed"
              >
                Unavailable
              </button>
            )
          })()}
        </div>
      </div>
      {livePreview ? (
        <style jsx>{`
          .live-preview-dot {
            width: 8px;
            height: 8px;
            border-radius: 9999px;
            background-color: #22c55e;
            box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
            animation: live-preview-pulse 1.8s infinite;
          }

          .live-preview-routing {
            background: linear-gradient(90deg, #f97316, #fb923c, #f97316);
            background-size: 200% 100%;
            animation: live-preview-shimmer 3s linear infinite;
            box-shadow: 0 10px 24px rgba(249, 115, 22, 0.18);
            transition: box-shadow 180ms ease, transform 180ms ease, opacity 180ms ease;
          }

          .group:hover :global(.live-preview-routing) {
            box-shadow: 0 12px 28px rgba(249, 115, 22, 0.22);
          }

          @keyframes live-preview-pulse {
            0% {
              opacity: 0.6;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.35);
            }
            100% {
              opacity: 0.6;
              transform: scale(1);
            }
          }

          @keyframes live-preview-shimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}</style>
      ) : null}
    </div>
  )
}
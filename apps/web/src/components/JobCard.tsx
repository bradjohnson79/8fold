'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { formatMoney, REVENUE_SPLIT } from '@8fold/shared'
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
    routerEarningsCents: number
    brokerFeeCents: number
    contractorPayoutCents: number
    laborTotalCents?: number
    materialsTotalCents?: number
    transactionFeeCents?: number
    status: string
    image?: string
  }
  isAuthenticated?: boolean
}

export function JobCard({ job, isAuthenticated = false }: JobCardProps) {
  const [imageError, setImageError] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagToast, setFlagToast] = useState<string | null>(null)
  const tradeBadge = job.tradeCategory ? job.tradeCategory.replace(/_/g, ' ') : null
  const currency = (job.currency ?? (job.country === 'CA' ? 'CAD' : 'USD')) as 'USD' | 'CAD'

  const computed = useMemo(() => {
    const labor = Number.isFinite(job.laborTotalCents as any) ? (job.laborTotalCents ?? null) : null
    const materials = Number.isFinite(job.materialsTotalCents as any) ? (job.materialsTotalCents ?? 0) : 0

    const fallbackTotal =
      (job.contractorPayoutCents ?? 0) +
      (job.routerEarningsCents ?? 0) +
      (job.brokerFeeCents ?? 0)

    const totalCents =
      labor !== null ? labor : (fallbackTotal > 0 ? fallbackTotal : null)

    const routerCents = labor !== null ? Math.round(labor * REVENUE_SPLIT.router) : (job.routerEarningsCents ?? 0)
    const contractorCents = labor !== null ? Math.round(labor * REVENUE_SPLIT.contractor) : (job.contractorPayoutCents ?? 0)
    const platformCents =
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
    const status = job.status || 'PUBLISHED'
    if (status === 'OPEN_FOR_ROUTING' || status === 'PUBLISHED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-8fold-green text-white">
          Awaiting Router
        </span>
      )
    }
    if (status === 'IN_PROGRESS') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Routed
        </span>
      )
    }
    if (status === 'PUBLISHED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-8fold-green text-white">
          Available
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        Routing Pending
      </span>
    )
  }

  function categoryLabel(): string {
    const raw = (job.tradeCategory ?? '').trim()
    if (raw) return raw.replace(/_/g, ' ')
    return (job.serviceType ?? 'Job').trim()
  }

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

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-bold text-gray-900 leading-tight">{job.title}</h3>
          <div className="flex items-center gap-2">
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
          {job.image && !imageError ? (
            <Image
              src={job.image}
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
              Router Earns ({(REVENUE_SPLIT.router * 100).toFixed(1)}% of labor):
            </span>
            <span className="text-8fold-green font-bold text-lg">
              {formatMoney(computed.routerCents, currency)}
            </span>
          </div>

          <div className="flex justify-between text-sm text-gray-700 px-1">
            <span className="font-medium">
              Contractor Receives ({(REVENUE_SPLIT.contractor * 100).toFixed(1)}% of labor):
            </span>
            <span className="font-semibold">
              {formatMoney(computed.contractorCents, currency)}
            </span>
          </div>

          <div className="flex justify-between text-xs text-gray-500 px-1">
            <span>Platform Fee ({(REVENUE_SPLIT.platform * 100).toFixed(1)}% of labor):</span>
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
            const routable = s === "OPEN_FOR_ROUTING" || s === "PUBLISHED"
            const assigned = s === "IN_PROGRESS" || s === "ASSIGNED"

            if (routable) {
              if (isAuthenticated) {
                return (
                  <button className="w-full bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200">
                    Route this Job
                  </button>
                )
              }
              return (
                <button className="w-full bg-8fold-green hover:bg-8fold-green-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200">
                  Sign Up and Route this Job
                </button>
              )
            }

            // Default for IN_PROGRESS / ASSIGNED (and any non-routable states).
            if (job.isMock && assigned) {
              return (
                <button
                  disabled
                  className="w-full bg-orange-100 text-orange-900 font-semibold py-3 px-4 rounded-lg cursor-not-allowed border border-orange-200"
                >
                  Routing in Progress
                </button>
              )
            }
            return (
              <button
                disabled
                className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-4 rounded-lg cursor-not-allowed"
              >
                Router Assigned
              </button>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
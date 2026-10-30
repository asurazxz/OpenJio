// Travel times: live OneMap routes through the local server when available, otherwise
// labelled estimates. The itinerary search uses the synchronous `travelFn`, which reads
// any live durations already fetched and falls back to the estimate.

import { estimateTravel } from './geo.js'
import { sgParts } from './time.js'

const API = import.meta.env?.VITE_API_BASE || 'http://localhost:8787'
const live = new Map()
let serverStatus = null

function key(a, b, mode, departMs) {
  const r = (n) => n.toFixed(4)
  const p = sgParts(departMs)
  return `${r(a.lat)},${r(a.lng)}|${r(b.lat)},${r(b.lng)}|${mode}|${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export async function serverHealth(force = false) {
  if (serverStatus && !force) return serverStatus
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(2500) })
    serverStatus = res.ok ? await res.json() : { ok: false }
  } catch {
    serverStatus = { ok: false }
  }
  return serverStatus
}

export function liveRoutingAvailable() {
  return serverStatus?.onemap === 'ok'
}

/** Synchronous travel function for algorithms. departMs selects a cached live route if one exists. */
export function travelFn(departMs) {
  return (a, b, legDepartMs = departMs) => {
    const est = estimateTravel(a, b)
    if (legDepartMs) {
      const hit = live.get(key(a, b, est.mode, legDepartMs))
      if (hit) return { mins: hit, mode: est.mode, estimate: false }
    }
    return est
  }
}

/** Fetch live durations for consecutive legs so a later travelFn call can use them. */
export async function prefetchLegs(points, departMs) {
  const status = await serverHealth()
  if (status.onemap !== 'ok') return { live: false }
  let fetched = 0
  await Promise.all(
    points.slice(1).map(async (b, i) => {
      const a = points[i]
      const legDepartMs = Array.isArray(departMs) ? departMs[i] : departMs
      const mode = estimateTravel(a, b).mode
      const k = key(a, b, mode, legDepartMs)
      if (live.has(k)) return
      try {
        const q = new URLSearchParams({ from: `${a.lat},${a.lng}`, to: `${b.lat},${b.lng}`, mode, depart: new Date(legDepartMs).toISOString() })
        const res = await fetch(`${API}/api/route?${q}`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return
        const data = await res.json()
        if (data.durationMins > 0) {
          live.set(k, data.durationMins)
          fetched++
        }
      } catch {
        /* keep the estimate */
      }
    }),
  )
  return { live: fetched > 0, fetched }
}

// Shared mode requires a signed-in caller for provider lookups. Imported lazily
// because the demo runtime imports this module while the API is being built.
async function authHeaders() {
  const { getProviderToken } = await import('../api/index.js')
  const token = await getProviderToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function geocode(q) {
  const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(q)}`, { headers: await authHeaders(), signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'geocode_failed')
  return res.json()
}

export async function fetchDrafts() {
  const res = await fetch(`${API}/api/ingest/drafts`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error('drafts_unavailable')
  const data = await res.json()
  // The pipeline stores drafts keyed by id; accept either shape.
  return Array.isArray(data) ? data : Object.values(data || {})
}

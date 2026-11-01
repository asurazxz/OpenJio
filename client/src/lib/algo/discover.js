// Discover ranking (R1): interest match, distance, availability at the chosen time and
// freshness, followed by a diversity pass so one category does not fill the top of the feed.
// A small timeliness lift puts deals, events and open jios ahead of evergreen places.

import { haversineKm } from '../geo.js'
import { toMs, DAY } from '../time.js'
import { availableInWindow } from './validity.js'
import { memberScore } from './itinerary.js'

// The four base weights sum to 1.0. `timely` adds a small 0.08 lift for deals, events and open jios
// (0 for places). It is about a third of the interest weight: a strong place match (base score
// around 0.7 and up) still outranks a weak time-sensitive listing (base around 0.2), but between
// similar matches the timely listing leads.
export const DISCOVER_WEIGHTS = { interest: 0.45, distance: 0.25, available: 0.15, fresh: 0.15, timely: 0.08 }
const TIMELY_TYPES = new Set(['deal', 'event', 'hangout'])

export function timelyBoost(listing) {
  return TIMELY_TYPES.has(listing.type) ? 1 : 0
}

export function scoreListing(listing, { interests = {}, near = null, window = null, now = Date.now() }) {
  const interest = Object.keys(interests).length ? memberScore(listing, { interests }) : 0.5
  const km = near && Number.isFinite(listing.lat) && Number.isFinite(listing.lng) ? haversineKm(near, listing) : null
  const distance = km == null ? 0.5 : Math.max(0, 1 - km / 10)
  const available = window ? (availableInWindow(listing, window.start, window.end) ? 1 : 0) : 0.5
  const age = now - (toMs(listing.source?.verifiedAt || listing.source?.retrievedAt || listing.createdAt) || now)
  const fresh = Math.max(0, 1 - age / (30 * DAY))
  const W = DISCOVER_WEIGHTS
  return {
    score: W.interest * interest + W.distance * distance + W.available * available + W.fresh * fresh + W.timely * timelyBoost(listing),
    km,
    available: window ? available === 1 : null,
    interest,
  }
}

export function rankListings(listings, params) {
  const scored = listings.map((l) => ({ listing: l, ...scoreListing(l, params) }))
  scored.sort((a, b) => b.score - a.score || a.listing.id.localeCompare(b.listing.id))
  return diversify(scored)
}

/** Push back an item when the two above it share its main category. */
export function diversify(items) {
  const out = []
  const queue = items.slice()
  while (queue.length) {
    const idx = queue.findIndex((it) => {
      const cat = it.listing.interests?.[0]
      const a = out[out.length - 1]?.listing.interests?.[0]
      const b = out[out.length - 2]?.listing.interests?.[0]
      return !(cat && cat === a && cat === b)
    })
    out.push(queue.splice(idx === -1 ? 0 : idx, 1)[0])
  }
  return out
}

/** Category used to spread a capped list: deal, event, hangout, place-meal or place-activity. */
export function listingKind(listing) {
  if (listing.type === 'place') return listing.kind === 'meal' ? 'place-meal' : 'place-activity'
  return listing.type
}

/**
 * Take at most `limit` ranked items, round-robin across kinds so one category cannot dominate.
 * Each kind keeps its own rank order; the chosen items are returned in overall rank order.
 * `items` are ranked entries such as { listing, score }.
 */
export function capByKind(items, limit, kindOf = (item) => listingKind(item.listing)) {
  if (items.length <= limit) return items.slice()
  const queues = new Map()
  items.forEach((item, rank) => {
    const kind = kindOf(item)
    if (!queues.has(kind)) queues.set(kind, [])
    queues.get(kind).push({ item, rank })
  })
  const picked = []
  let progressed = true
  while (picked.length < limit && progressed) {
    progressed = false
    for (const queue of queues.values()) {
      if (picked.length >= limit) break
      const next = queue.shift()
      if (!next) continue
      picked.push(next)
      progressed = true
    }
  }
  return picked.sort((a, b) => a.rank - b.rank).map((p) => p.item)
}

// Discover ranking (R1): interest match, distance, availability at the chosen time and
// freshness, followed by a diversity pass so one category does not fill the top of the feed.

import { haversineKm } from '../geo.js'
import { toMs, DAY } from '../time.js'
import { availableInWindow } from './validity.js'
import { memberScore } from './itinerary.js'

export const DISCOVER_WEIGHTS = { interest: 0.45, distance: 0.25, available: 0.15, fresh: 0.15 }

export function scoreListing(listing, { interests = {}, near = null, window = null, now = Date.now() }) {
  const interest = Object.keys(interests).length ? memberScore(listing, { interests }) : 0.5
  const km = near ? haversineKm(near, listing) : null
  const distance = km == null ? 0.5 : Math.max(0, 1 - km / 10)
  const available = window ? (availableInWindow(listing, window.start, window.end) ? 1 : 0) : 0.5
  const age = now - (toMs(listing.source?.verifiedAt || listing.source?.retrievedAt || listing.createdAt) || now)
  const fresh = Math.max(0, 1 - age / (30 * DAY))
  const W = DISCOVER_WEIGHTS
  return {
    score: W.interest * interest + W.distance * distance + W.available * available + W.fresh * fresh,
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

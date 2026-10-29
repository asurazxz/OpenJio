// Distance and travel-time estimates used when live OneMap routing is unavailable,
// and inside the itinerary search where hundreds of legs are compared.

const EARTH_KM = 6371

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

const WALK_KMH = 4.5
const TRANSIT_KMH = 22
const DETOUR = 1.3
const WALK_LIMIT_KM = 1.2
const TRANSIT_OVERHEAD_MIN = 10

/**
 * Estimated door-to-door minutes. Short hops are walked; longer ones assume
 * public transport with a fixed overhead for walking to and waiting at stops.
 */
export function estimateTravel(a, b) {
  const km = haversineKm(a, b) * DETOUR
  if (km <= WALK_LIMIT_KM) {
    return { mins: Math.max(2, Math.ceil((km / WALK_KMH) * 60)), mode: 'walk', estimate: true }
  }
  return { mins: Math.ceil(TRANSIT_OVERHEAD_MIN + (km / TRANSIT_KMH) * 60), mode: 'pt', estimate: true }
}

export function estimateMins(a, b) {
  return estimateTravel(a, b).mins
}

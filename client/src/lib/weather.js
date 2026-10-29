// NEA 2-hour weather forecast from data.gov.sg (public, no key). Picks the forecast area nearest a point.
import { haversineKm } from './geo.js'

let cache = null

export async function forecastNear(point) {
  if (!cache || Date.now() - cache.at > 10 * 60 * 1000) {
    const res = await fetch('https://api.data.gov.sg/v1/environment/2-hour-weather-forecast', { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error('Weather is unavailable right now.')
    const data = await res.json()
    cache = { at: Date.now(), data }
  }
  const { area_metadata: areas, items } = cache.data
  const item = items?.[0]
  if (!areas?.length || !item) throw new Error('Weather is unavailable right now.')
  const nearest = areas
    .map((a) => ({ name: a.name, km: haversineKm(point, { lat: a.label_location.latitude, lng: a.label_location.longitude }) }))
    .sort((a, b) => a.km - b.km)[0]
  const f = item.forecasts.find((x) => x.area === nearest.name)
  return {
    area: nearest.name,
    forecast: f?.forecast || 'Unknown',
    validFrom: item.valid_period?.start,
    validTo: item.valid_period?.end,
    wet: /rain|shower|thunder/i.test(f?.forecast || ''),
  }
}

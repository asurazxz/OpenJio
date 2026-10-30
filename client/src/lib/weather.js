// Latest NEA issuances: a date query selects past issuances, not a future forecast.
import { haversineKm } from './geo.js'
import { sgDateKey, fromDateKey, DAY } from './time.js'
const BASE = 'https://api-open.data.gov.sg/v2/real-time/api/'
const ENDPOINTS = { twoHour: 'two-hr-forecast', day: 'twenty-four-hr-forecast', fourDay: 'four-day-outlook' }
const cache = new Map()
const SOURCE = 'NEA via data.gov.sg'
// Approximate regional label selection; the returned period is explicitly regional.
const REGIONS = [
  { name: 'central', lat: 1.33, lng: 103.84 }, { name: 'north', lat: 1.42, lng: 103.82 },
  { name: 'south', lat: 1.24, lng: 103.83 }, { name: 'east', lat: 1.35, lng: 103.94 }, { name: 'west', lat: 1.35, lng: 103.70 },
]
const covers = (period, time) => Number.isFinite(time) && Date.parse(period?.start) <= time && time < Date.parse(period?.end)
const newest = (records) => [...(Array.isArray(records) ? records : [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
function result(forecast, details) {
  return { available: true, source: SOURCE, forecast, wet: /rain|shower|thunder/i.test(forecast), ...details }
}

/** Fixture-testable selection by the locked outing START, never by today's date. */
export function selectForecast({ twoHour, day, fourDay } = {}, point, startMs) {
  const areas = Array.isArray(twoHour?.data?.area_metadata) ? twoHour.data.area_metadata : []
  const nearest = areas.filter((a) => Number.isFinite(a.label_location?.latitude) && Number.isFinite(a.label_location?.longitude))
    .map((a) => ({ ...a, km: haversineKm(point, { lat: a.label_location.latitude, lng: a.label_location.longitude }) })).sort((a, b) => a.km - b.km)[0]
  for (const item of newest(twoHour?.data?.items)) {
    if (!covers(item.valid_period, startMs) || !nearest) continue
    const forecast = item.forecasts?.find((entry) => entry.area === nearest.name)?.forecast
    if (typeof forecast === 'string' && forecast) return result(forecast, { area: nearest.name, horizon: '2-hour', issuedAt: item.timestamp, validFrom: item.valid_period.start, validTo: item.valid_period.end })
  }
  const region = [...REGIONS].sort((a, b) => haversineKm(point, a) - haversineKm(point, b))[0].name
  for (const record of newest(day?.data?.records)) {
    for (const period of Array.isArray(record.periods) ? record.periods : []) {
      const forecast = period.regions?.[region]?.text
      if (covers(period.timePeriod, startMs) && typeof forecast === 'string' && forecast) {
        return result(forecast, { area: `${region[0].toUpperCase()}${region.slice(1)} region`, horizon: '24-hour', issuedAt: record.timestamp, validFrom: period.timePeriod.start, validTo: period.timePeriod.end, temperature: record.general?.temperature })
      }
    }
  }
  for (const record of newest(fourDay?.data?.records)) {
    for (const entry of Array.isArray(record.forecasts) ? record.forecasts : []) {
      const timestamp = Date.parse(entry.timestamp)
      const forecast = entry.forecast?.summary || entry.forecast?.text
      if (!Number.isFinite(timestamp) || sgDateKey(timestamp) !== sgDateKey(startMs) || typeof forecast !== 'string' || !forecast) continue
      const midnight = fromDateKey(sgDateKey(timestamp))
      return result(forecast, { area: 'Singapore-wide', horizon: '4-day outlook', issuedAt: record.timestamp, validFrom: `${sgDateKey(timestamp)}T00:00:00+08:00`, validTo: new Date(midnight + DAY).toISOString(), temperature: entry.temperature })
    }
  }
  return { available: false, source: SOURCE, reason: 'NEA has no published forecast covering this outing start. Check again closer to the day.' }
}

export async function forecastNear(point, startMs = Date.now(), { fetchImpl = fetch, fresh = false, signal } = {}) {
  if (!Number.isFinite(startMs)) throw new Error('Choose an outing start to check the weather.')
  const payloads = {}
  let failures = 0
  for (const [key, endpoint] of Object.entries(ENDPOINTS)) {
    try {
      const cached = cache.get(endpoint)
      if (!fresh && cached && Date.now() - cached.at < 10 * 60000) payloads[key] = cached.data
      else {
        const response = await fetchImpl(BASE + endpoint, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000) })
        if (!response.ok) throw new Error('Weather request failed')
        const data = await response.json()
        if (data?.code !== 0 || !data.data || (key === 'twoHour' ? !Array.isArray(data.data.items) : !Array.isArray(data.data.records))) throw new Error('Invalid weather response')
        cache.set(endpoint, { at: Date.now(), data })
        payloads[key] = data
      }
      const forecast = selectForecast(payloads, point, startMs)
      if (forecast.available) return forecast
    } catch (error) { if (signal?.aborted) throw error; failures++ }
  }
  const outlookDates = (newest(payloads.fourDay?.data?.records)[0]?.forecasts || [])
    .map((entry) => Date.parse(entry.timestamp)).filter(Number.isFinite)
  // A loaded outlook establishes the outer horizon even if shorter-range requests fail.
  const beyondOutlook = outlookDates.length && startMs >= Math.max(...outlookDates) + DAY
  if (failures && !beyondOutlook) throw new Error('Weather could not be loaded for the outing. Try again.')
  return selectForecast(payloads, point, startMs)
}

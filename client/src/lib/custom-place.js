import { dayKey, parseHHMM } from './time.js'

const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''
const invalid = message => { throw Object.assign(new Error(message), { code: 'invalid' }) }
const clock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

/** Host-entered places remain private planning inputs, never public listings. */
export function customPlace(input, { id, slot, area }) {
  if (!input || typeof input !== 'object') invalid('Enter the place details.')
  const title = text(input.name, 160), address = text(input.address, 320)
  if (!title || !address) invalid('Enter the place name and address.')
  const lat = Number(input.lat), lng = Number(input.lng), durationMins = Number(input.durationMins)
  if (input.lat == null || input.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 1.13 || lat > 1.48 || lng < 103.58 || lng > 104.1) invalid('Choose a location in Singapore.')
  if (!Number.isInteger(durationMins) || durationMins < 5 || durationMins > 480) invalid('Visit duration must be between 5 and 480 minutes.')
  if (!['activity', 'meal'].includes(input.kind)) invalid('Choose whether this is an activity or a meal.')
  let openingHours = null
  if (input.opens || input.closes) {
    if (!clock(input.opens) || !clock(input.closes) || parseHHMM(input.closes) <= parseHHMM(input.opens)) invalid('Enter valid opening and closing times for the outing day.')
    openingHours = { [dayKey(slot.start)]: [[input.opens, input.closes]] }
  }
  let website = ''
  if (input.website) {
    try {
      const url = new URL(input.website)
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) website = url.toString().slice(0, 2048)
    } catch { /* invalid external URLs are not rendered */ }
  }
  const provider = input.provider === 'geoapify' ? 'geoapify' : 'manual'
  return {
    id, type: 'place', kind: input.kind, title, address, lat, lng, durationMins,
    area, interests: input.kind === 'meal' ? ['food'] : [], openingHours,
    openingHoursText: text(input.openingHoursText, 500), website, provider,
    providerId: provider === 'geoapify' ? text(input.providerId, 256) : '',
    custom: true, routeReady: true, status: 'private',
    summary: 'Added by the host for this outing.',
    source: { kind: 'custom', name: provider === 'geoapify' ? 'Geoapify / OpenStreetMap' : 'Host added', url: website, verifiedAt: null },
  }
}

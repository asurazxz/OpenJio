// The final handoff for a confirmed plan: paste-ready text, a calendar file and per-stop links.
// Pure functions only. Times are Singapore time (see time.js); nothing here books anything.
import { sgParts, sgDateKey, fmtDay, fmtTime, fmtRange } from './time.js'

const BOOKING_LINE = 'Nothing is booked through OpenJio.'

const safeUrl = (value) => {
  try {
    const u = new URL(value)
    return ['https:', 'http:'].includes(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}

export function planLink(origin, hangoutId) {
  return `${String(origin || '').replace(/\/$/, '')}/h/${hangoutId}`
}

/** The exact meeting point when the host set one, otherwise the start area. */
export function meetingLabel(hangout) {
  const exact = String(hangout.meetingPoint || '').trim()
  if (exact) return { exact: true, text: exact }
  return { exact: false, text: `Around ${hangout.startArea?.label || 'the start area'}` }
}

/** "Fri 6 Nov, 6–11 pm"; a mixed am/pm range reads "6 pm–1 am"; several days fall back to fmtRange. */
export function whenLine(startMs, endMs) {
  if (sgDateKey(startMs) !== sgDateKey(endMs - 1)) return fmtRange(startMs, endMs)
  const part = (ms) => {
    const { hour, minute } = sgParts(ms)
    return { clock: `${hour % 12 === 0 ? 12 : hour % 12}${minute ? ':' + String(minute).padStart(2, '0') : ''}`, suffix: hour < 12 ? 'am' : 'pm' }
  }
  const a = part(startMs)
  const b = part(endMs)
  const range = a.suffix === b.suffix ? `${a.clock}–${b.clock} ${b.suffix}` : `${a.clock} ${a.suffix}–${b.clock} ${b.suffix}`
  return `${fmtDay(startMs)}, ${range}`
}

/** A short place name for a stop: the street address without the ", Singapore 123456" tail. */
export function stopPlace(listing) {
  const address = String(listing.address || '').replace(/,?\s*Singapore\s*\d*\s*$/i, '').trim()
  return address
}

export function stopLine(stop) {
  const place = stopPlace(stop.listing)
  return `${fmtTime(stop.start)} ${stop.listing.title}${place ? `, ${place}` : ''}`
}

/** Google Maps directions to the stop's coordinates, or its address when the position is unknown. */
export function directionsUrl(listing) {
  const hasPoint = listing.locationKnown !== false && Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
  const destination = hasPoint ? `${listing.lat},${listing.lng}` : stopPlace(listing)
  if (!destination) return ''
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination).replace(/%2C/g, ',')}`
}

/** The listing's own page, when it has one (deals and events read from a public source). */
export function sourceUrl(listing) {
  return safeUrl(listing.bookingUrl) || safeUrl(listing.source?.url)
}

/** Conditions that exist in the listing data, by stop name. Never inferred. */
export function bookingChecks(stops) {
  const out = []
  for (const s of stops) {
    const l = s.listing
    const conditions = (Array.isArray(l.conditions) ? l.conditions : []).map((c) => String(c).trim()).filter(Boolean)
    if (conditions.length) out.push({ title: l.title, text: conditions.join(', ') })
  }
  return out
}

export function checkLine(check) {
  return `Check: ${check.title} (${check.text})`
}

export function buildItineraryText({ hangout, stops, link }) {
  const slot = hangout.lockedSlot
  const lines = [`${hangout.title} · ${whenLine(slot.start, slot.end)}`, `Meet: ${meetingLabel(hangout).text.replace(/^Around /, 'around ')}`]
  for (const s of stops) lines.push(stopLine(s))
  for (const c of bookingChecks(stops)) lines.push(checkLine(c))
  lines.push(BOOKING_LINE)
  lines.push(`Plan: ${link}`)
  return lines.join('\n')
}

// ---- Calendar file ----

const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

export function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Content lines longer than 75 octets continue on the next line after a space (RFC 5545).
function fold(line) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
      size = 0
    }
    cur += ch
    size += n
  }
  if (cur) parts.push(cur)
  return parts.join('\r\n ')
}

export function buildIcs({ hangout, stops, link, now = Date.now() }) {
  const slot = hangout.lockedSlot
  const description = [
    ...stops.map(stopLine),
    ...bookingChecks(stops).map(checkLine),
    BOOKING_LINE,
    `Plan: ${link}`,
  ].join('\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenJio//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${hangout.id}@openjio`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(slot.start)}`,
    `DTEND:${icsStamp(slot.end)}`,
    `SUMMARY:${icsEscape(hangout.title)}`,
    `LOCATION:${icsEscape(meetingLabel(hangout).text)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${link}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsFileName(title) {
  const base = String(title || 'plan').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'plan'
  return `${base}.ics`
}

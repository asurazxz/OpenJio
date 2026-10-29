// Whether a listing can be visited in a given time window.
// Unknown opening hours are reported as unknown, never as open.

import { dayKey, dayCode, minutesOfDay, parseHHMM, sgDateKey, sgStartOfDay, toMs, MIN } from '../time.js'

/**
 * @returns {true|false|null} true if [startMs, endMs] sits inside one opening window,
 * false if it does not, null if hours are unknown.
 */
export function isOpenDuring(openingHours, startMs, endMs) {
  if (!openingHours) return null
  if (sgDateKey(startMs) !== sgDateKey(endMs - 1)) return false
  const windows = openingHours[dayKey(startMs)] || []
  const s = minutesOfDay(startMs)
  const e = s + Math.round((endMs - startMs) / MIN)
  return windows.some(([open, close]) => {
    const o = parseHHMM(open)
    const c = close === '23:59' ? 24 * 60 : parseHHMM(close)
    return s >= o && e <= c
  })
}

/** Deal validity: date range, weekday and time window must all hold for the whole visit. */
export function isDealValidDuring(validity, startMs, endMs) {
  if (!validity) return false
  const key = sgDateKey(startMs)
  if (validity.dateFrom && key < validity.dateFrom) return false
  if (validity.dateTo && key > validity.dateTo) return false
  if (validity.daysOfWeek?.length && !validity.daysOfWeek.includes(dayCode(startMs))) return false
  if (validity.timeWindows?.length) {
    const s = minutesOfDay(startMs)
    const e = s + Math.round((endMs - startMs) / MIN)
    return validity.timeWindows.some((w) => s >= parseHHMM(w.start) && e <= parseHHMM(w.end))
  }
  return true
}

/** A deal counts as verified only when its source has a verification time and it is published. */
export function isVerifiedDeal(listing) {
  return listing.type === 'deal' && Boolean(listing.source?.verifiedAt) && listing.status !== 'draft'
}

/**
 * Earliest feasible start for a listing given arrival time, plus its end.
 * Returns { ok, start, end, reason, unknown }.
 */
export function scheduleAt(listing, arriveMs) {
  const dur = (listing.durationMins || 60) * MIN
  if (listing.type === 'event') {
    const evStart = toMs(listing.startsAt)
    const evEnd = toMs(listing.endsAt)
    if (!evStart || !evEnd) return { ok: false, reason: 'Event time unknown', unknown: true }
    const start = Math.max(arriveMs, evStart)
    const end = Math.min(evEnd, start + dur)
    if (end - start < 30 * MIN) return { ok: false, reason: 'Arrives too late for the event' }
    return { ok: true, start, end, waitMins: Math.round((start - arriveMs) / MIN) }
  }
  if (listing.type === 'hangout') {
    const start = Math.max(arriveMs, toMs(listing.startsAt))
    const end = Math.min(toMs(listing.endsAt), start + dur)
    if (end - start < 30 * MIN) return { ok: false, reason: 'Open jio already over' }
    return { ok: true, start, end, waitMins: Math.round((start - arriveMs) / MIN) }
  }
  const start = arriveMs
  const end = start + dur
  const open = isOpenDuring(listing.openingHours, start, end)
  if (open === null) return { ok: false, reason: 'Opening hours unknown', unknown: true, start, end }
  if (!open) return { ok: false, reason: 'Closed at that time', start, end }
  if (listing.type === 'deal' && !isDealValidDuring(listing.validity, start, end)) {
    return { ok: false, reason: 'Deal not valid at that time', start, end, dealInvalid: true }
  }
  return { ok: true, start, end, waitMins: 0 }
}

/** Is a listing usable at some point between startMs and endMs (for Discover filters)? */
export function availableInWindow(listing, startMs, endMs) {
  if (listing.type === 'event' || listing.type === 'hangout') {
    const s = toMs(listing.startsAt)
    const e = toMs(listing.endsAt)
    return s < endMs && e > startMs
  }
  const step = 30 * MIN
  const dur = Math.min((listing.durationMins || 60) * MIN, endMs - startMs)
  for (let t = startMs; t + dur <= endMs; t += step) {
    const r = scheduleAt(listing, t)
    if (r.ok) return true
  }
  return false
}

/** True if the listing is ever valid on the Singapore day of ms (for "today" style filters). */
export function dealActiveOnDay(validity, ms) {
  const dayStart = sgStartOfDay(ms)
  return isDealValidDuring({ ...validity, timeWindows: null }, dayStart, dayStart + MIN)
}

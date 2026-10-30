import { MIN, sgDateKey } from './time.js'

const GRID_MS = 30 * MIN

function ms(value) {
  if (value == null || value === '') return NaN
  return typeof value === 'number' ? value : new Date(value).getTime()
}

/** Assess a proposed time against each member's saved availability. */
export function assessSlot({ slot, members = [], availability = {}, rangeStart, rangeEnd, minimumMins = 120 }) {
  const errors = []
  const start = ms(slot?.start)
  const end = ms(slot?.end)
  const rangeStartMs = ms(rangeStart)
  const rangeEndMs = ms(rangeEnd)
  const finite = [start, end, rangeStartMs, rangeEndMs].every(Number.isFinite)
  if (!finite) errors.push('Choose valid start and end times.')
  if (finite) {
    if (end <= start) errors.push('End time must be after start time.')
    if (sgDateKey(start) !== sgDateKey(end - 1)) errors.push('The time must fit within one Singapore day.')
    if (start < rangeStartMs || end > rangeEndMs || rangeEndMs <= rangeStartMs) errors.push('The time must stay within the selected date range.')
    if ((end - start) / MIN < minimumMins) errors.push(`Choose at least ${minimumMins / 60} hours.`)
    if ((end - start) / MIN > 720) errors.push('Choose 12 hours or fewer, matching the outing limit.')
  }
  const attendees = []
  const missing = []
  const unknown = []
  const missingRequired = []
  if (finite && end > start) {
    for (const member of members) {
      const id = member.id
      const required = member.required !== false
      if (!member.responded) {
        unknown.push(id)
        if (required) missingRequired.push(id)
        continue
      }
      // Snap inward to the availability grid. Partial edge cells never count as free.
      const intervals = (availability[id] || []).map((x) => ({
        start: Math.ceil(ms(x.start) / GRID_MS) * GRID_MS,
        end: Math.floor(ms(x.end) / GRID_MS) * GRID_MS,
      })).filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
        .sort((a, b) => a.start - b.start)
      let coveredUntil = start
      for (const interval of intervals) {
        if (interval.start > coveredUntil) break
        if (interval.end > coveredUntil) coveredUntil = interval.end
        if (coveredUntil >= end) break
      }
      if (coveredUntil >= end) attendees.push(id)
      else {
        missing.push(id)
        if (required) missingRequired.push(id)
      }
    }
  }
  if (missingRequired.length) errors.push('Every required person must be free for the full time.')
  return { ok: errors.length === 0, errors, attendees, missing, unknown, missingRequired }
}

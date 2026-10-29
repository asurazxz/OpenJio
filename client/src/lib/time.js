// Singapore time helpers. Singapore is UTC+8 all year (no daylight saving),
// so wall-clock math is done by shifting epoch milliseconds by a fixed offset.

export const SG_OFFSET_MS = 8 * 60 * 60 * 1000
export const MIN = 60 * 1000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function toMs(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  return new Date(value).getTime()
}

/** Wall-clock parts in Singapore for an epoch ms value. */
export function sgParts(ms) {
  const d = new Date(ms + SG_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  }
}

/** Epoch ms for a Singapore wall-clock date/time. */
export function sgTime(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour, minute) - SG_OFFSET_MS
}

/** Start of the Singapore calendar day containing ms. */
export function sgStartOfDay(ms) {
  const p = sgParts(ms)
  return sgTime(p.year, p.month, p.day)
}

/** "YYYY-MM-DD" for the Singapore day containing ms. */
export function sgDateKey(ms) {
  const p = sgParts(ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Epoch ms for midnight Singapore of a "YYYY-MM-DD" key. */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return sgTime(y, m, d)
}

export function minutesOfDay(ms) {
  const p = sgParts(ms)
  return p.hour * 60 + p.minute
}

export function parseHHMM(text) {
  const [h, m] = text.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function dayKey(ms) {
  return DAY_KEYS[sgParts(ms).weekday]
}

export function dayCode(ms) {
  return DAY_CODES[sgParts(ms).weekday]
}

export function isWeekend(ms) {
  const w = sgParts(ms).weekday
  return w === 0 || w === 6
}

export function toIso(ms) {
  const p = sgParts(ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00+08:00`
}

export function pad(n) {
  return String(n).padStart(2, '0')
}

/** "2:30 pm" */
export function fmtTime(ms) {
  const { hour, minute } = sgParts(ms)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour < 12 ? 'am' : 'pm'
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${pad(minute)} ${suffix}`
}

/** "Sat 14 Nov" */
export function fmtDay(ms) {
  const p = sgParts(ms)
  return `${DAY_SHORT[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`
}

/** "Sat 14 Nov, 2 pm to 7 pm" */
export function fmtRange(startMs, endMs) {
  const sameDay = sgDateKey(startMs) === sgDateKey(endMs - 1)
  if (sameDay) return `${fmtDay(startMs)}, ${fmtTime(startMs)} to ${fmtTime(endMs)}`
  return `${fmtDay(startMs)} ${fmtTime(startMs)} to ${fmtDay(endMs)} ${fmtTime(endMs)}`
}

export function fmtDuration(mins) {
  const m = Math.round(mins)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

export function fmtDateKey(key) {
  return fmtDay(fromDateKey(key))
}

/** Human "3 days ago" style age. */
export function fmtAge(ms, now = Date.now()) {
  const diff = Math.max(0, now - ms)
  const days = Math.floor(diff / DAY)
  if (days >= 1) return days === 1 ? '1 day ago' : `${days} days ago`
  const hours = Math.floor(diff / HOUR)
  if (hours >= 1) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  return 'just now'
}

/** Every Singapore day key from start to end key inclusive. */
export function dateKeysBetween(fromKey, toKey) {
  const out = []
  for (let t = fromDateKey(fromKey); t <= fromDateKey(toKey); t += DAY) out.push(sgDateKey(t))
  return out
}

export function roundUpTo(ms, stepMins) {
  const step = stepMins * MIN
  return Math.ceil(ms / step) * step
}

export function roundDownTo(ms, stepMins) {
  const step = stepMins * MIN
  return Math.floor(ms / step) * step
}

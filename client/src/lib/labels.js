// Display labels shared across views.
import { INTERESTS, AREAS } from '../data/seed-listings.js'
import { parseHHMM, sgParts, dayKey, fmtDateKey, fmtTime } from './time.js'

export const interestLabel = (slug) => INTERESTS.find((i) => i.slug === slug)?.label || slug
export const areaLabel = (slug) => AREAS.find((a) => a.slug === slug)?.label || slug

export const TYPE_LABEL = { place: 'Place', event: 'Event', deal: 'Deal', hangout: 'Open Jio' }
export const TYPE_TONE = { place: 'tag-teal', event: 'tag-plum', deal: 'tag-mustard', hangout: 'tag-tomato' }

export const STAGES = [
  { key: 'collecting', label: 'Find a time' },
  { key: 'voting', label: 'Shape the plan' },
  { key: 'final', label: 'Go' },
]

export const STAGE_LABEL = {
  collecting: 'Finding a time',
  voting: 'Planning',
  final: 'Confirmed',
  ended: 'Ended',
  cancelled: 'Cancelled',
}

export function priceDots(level) {
  if (level == null) return ''
  return level === 0 ? 'Free' : '$'.repeat(level)
}

export function sourceLine(listing) {
  const s = listing.source || {}
  if (s.kind === 'openjio') return 'Hosted on OpenJio'
  if (s.kind === 'curated') return 'Sample data'
  if (s.kind === 'scraped') return `From ${s.name || 'a public source'}`
  return 'Source unknown'
}

// "3 of 8 spots left" or "Full", the same wording on Home, Discover and the join page.
export function spotsText(capacity, memberCount) {
  const left = Math.max(0, capacity - memberCount)
  return left ? `${left} of ${capacity} spots left` : 'Full'
}

// Card helpers: short, plain-words forms of listing facts.

/** The one fact a deal leads with: "1-for-1", "15% off", "Free"; otherwise a plain "Deal". */
export function dealHeadline(dealText, title = '') {
  // Extracted deals often have no offer line, so the title is the fallback ("1-for-1 Sunday Local Lunch Buffet").
  const t = `${dealText || ''} ${title || ''}`
  const m = t.match(/\d+\s*-?\s*for\s*-?\s*\d+/i) || t.match(/\d+\s*%\s*off/i) || t.match(/\$\s?\d+(?:\.\d+)?\s*off/i) || t.match(/\bbuy\s*\d+\s*get\s*\d+(?:\s*free)?/i) || t.match(/\bfree\b/i)
  if (!m) return 'Deal'
  const h = m[0].replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').replace(/(\d)\s*%/, '$1%').trim()
  return h[0].toUpperCase() + h.slice(1)
}

/** "About $6 per person" -> "~$6 each"; anything else is shown as written. */
export function priceShort(priceText) {
  if (!priceText) return ''
  const m = String(priceText).match(/^(?:about\s+)?(\$\d+(?:\s*(?:to|-)\s*\$?\d+)?)\s+per person$/i)
  return m ? `${/^about/i.test(priceText) ? '~' : ''}${m[1]} each` : priceText
}

const clock = (hhmm) => {
  if (hhmm === '23:59') return 'midnight'
  const mins = parseHHMM(hhmm)
  const h = Math.floor(mins / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${mins % 60 ? ':' + String(mins % 60).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`
}
// "8–11 am" when both ends share am/pm, otherwise "8 am–2 pm".
const clockRange = (a, b) => {
  const [x, y] = [clock(a), clock(b)]
  const [xn, xs] = x.split(' ')
  return y.endsWith(xs) && xs ? `${xn}–${y}` : `${x}–${y}`
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const DAY_NAME = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }

/** "Weekdays 8–11 am · until 31 Jan" from a deal's validity. */
export function validityText(validity) {
  if (!validity) return ''
  const days = validity.daysOfWeek || []
  let dayText = ''
  if (days.length && days.length < 7) {
    if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) dayText = 'Weekdays'
    else if (days.length === 2 && days.includes('SAT') && days.includes('SUN')) dayText = 'Weekends'
    else dayText = days.map((d) => DAY_NAME[d] || d).join(', ')
  } else if (days.length === 7) dayText = 'Daily'
  const w = validity.timeWindows?.[0]
  const timeText = w ? clockRange(w.start, w.end) : ''
  const lead = [dayText, timeText].filter(Boolean).join(' ')
  const until = validity.dateTo ? `until ${fmtDateKey(validity.dateTo).replace(/^\w+ /, '')}` : ''
  return [lead, until].filter(Boolean).join(' · ')
}

/** "Open now" / "Open 10 am–7 pm" / "Closed today" from weekly opening hours; '' when unknown. */
export function openingSummary(openingHours, now = Date.now()) {
  if (!openingHours) return ''
  const windows = openingHours[dayKey(now)] || []
  if (!windows.length) return 'Closed today'
  const p = sgParts(now)
  const mins = p.hour * 60 + p.minute
  if (windows.some(([a, b]) => mins >= parseHHMM(a) && mins <= parseHHMM(b))) return 'Open now'
  return `Open ${windows.map(([a, b]) => clockRange(a, b)).join(', ')}`
}

/** "6–11 pm" or "11 am–4 pm" for a start and end in epoch ms. */
export function timeSpan(startMs, endMs) {
  const a = fmtTime(startMs)
  const b = fmtTime(endMs)
  const [an, as] = a.split(' ')
  return b.endsWith(as) ? `${an}–${b}` : `${a}–${b}`
}

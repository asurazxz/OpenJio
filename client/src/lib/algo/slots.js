// Group slot ranking (R3).
// Inputs are each member's FREE intervals (epoch ms). Members who have not responded
// are unknown, not free, so they never count as available.

import { HOUR, MIN, minutesOfDay, isWeekend, sgStartOfDay, sgParts, fmtTime, fmtDuration } from '../time.js'

const DEFAULTS = {
  minDurationMins: 120,
  targetDurationMins: 300,
  preferredStartMins: 11 * 60,
  preferredEndMins: 22 * 60,
  topN: 5,
}

/** Merge overlapping or touching intervals. */
export function mergeIntervals(intervals) {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const out = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ start: i.start, end: i.end })
  }
  return out
}

/** Free time inside [from, to] after removing busy intervals. */
export function subtractBusy(free, busy) {
  let result = mergeIntervals(free)
  for (const b of mergeIntervals(busy)) {
    const next = []
    for (const f of result) {
      if (b.end <= f.start || b.start >= f.end) next.push(f)
      else {
        if (b.start > f.start) next.push({ start: f.start, end: b.start })
        if (b.end < f.end) next.push({ start: b.end, end: f.end })
      }
    }
    result = next
  }
  return result
}

/**
 * Conservative rounding for display buckets: busy time expands outwards,
 * free time shrinks inwards, so rounding never invents availability.
 */
export function roundBusyOut(interval, stepMins = 30) {
  const step = stepMins * MIN
  return { start: Math.floor(interval.start / step) * step, end: Math.ceil(interval.end / step) * step }
}
export function roundFreeIn(interval, stepMins = 30) {
  const step = stepMins * MIN
  const start = Math.ceil(interval.start / step) * step
  const end = Math.floor(interval.end / step) * step
  return end > start ? { start, end } : null
}

/** Sweep line: split the range into segments with a constant set of available members. */
export function segments(availability, memberIds, rangeStart, rangeEnd) {
  const events = []
  for (const id of memberIds) {
    for (const iv of mergeIntervals(availability[id] || [])) {
      const s = Math.max(iv.start, rangeStart)
      const e = Math.min(iv.end, rangeEnd)
      if (e > s) {
        events.push({ t: s, id, d: 1 })
        events.push({ t: e, id, d: -1 })
      }
    }
  }
  events.sort((a, b) => a.t - b.t || a.d - b.d)
  const active = new Map()
  const segs = []
  let prev = null
  for (const ev of events) {
    if (prev !== null && ev.t > prev && active.size) {
      segs.push({ start: prev, end: ev.t, members: new Set(active.keys()) })
    }
    active.set(ev.id, (active.get(ev.id) || 0) + ev.d)
    if (active.get(ev.id) <= 0) active.delete(ev.id)
    prev = ev.t
  }
  return segs
}

function isSubset(a, b) {
  for (const x of a) if (!b.has(x)) return false
  return true
}

/** Maximal windows where every member of `group` is available. */
function windowsFor(group, segs) {
  const out = []
  let cur = null
  for (const s of segs) {
    if (isSubset(group, s.members)) {
      if (cur && cur.end === s.start) cur.end = s.end
      else {
        if (cur) out.push(cur)
        cur = { start: s.start, end: s.end }
      }
    } else if (cur) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Fraction of [start, end] that falls inside the preferred daily band. */
function preferredFraction(start, end, opts) {
  let inside = 0
  for (let t = start; t < end; t += 30 * MIN) {
    const m = minutesOfDay(t)
    if (m >= opts.preferredStartMins && m < opts.preferredEndMins) inside += 1
  }
  const total = Math.max(1, Math.round((end - start) / (30 * MIN)))
  return inside / total
}

/**
 * Pick the best sub-slot of a long window: the target length, placed to sit
 * as much as possible inside the preferred band, starting on the hour.
 */
export function bestSubSlot(window, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts }
  const len = Math.min(window.end - window.start, o.targetDurationMins * MIN)
  if (window.end - window.start <= len) return { start: window.start, end: window.end }
  let best = null
  for (let s = window.start; s + len <= window.end; s += 30 * MIN) {
    const f = preferredFraction(s, s + len, o)
    const onHour = s % HOUR === 0 ? 0.01 : 0
    const score = f + onHour
    if (!best || score > best.score + 1e-9) best = { start: s, end: s + len, score }
  }
  return { start: best.start, end: best.end }
}

/**
 * Rank candidate group slots.
 * @param {object} p
 * @param {{id:string, name?:string, required?:boolean, responded?:boolean}[]} p.members
 * @param {Record<string, {start:number,end:number}[]>} p.availability free intervals per member
 * @param {number} p.rangeStart
 * @param {number} p.rangeEnd
 * @returns {{slots: object[], missingRequired: string[], unknown: string[]}}
 */
export function rankSlots({ members, availability, rangeStart, rangeEnd, options = {} }) {
  const o = { ...DEFAULTS, ...options }
  const responded = members.filter((m) => m.responded)
  const unknown = members.filter((m) => !m.responded).map((m) => m.id)
  const required = members.filter((m) => m.required)
  const missingRequired = required.filter((m) => !m.responded).map((m) => m.id)
  if (missingRequired.length || responded.length === 0) {
    return { slots: [], missingRequired, unknown }
  }

  const ids = responded.map((m) => m.id)
  const requiredIds = new Set(required.map((m) => m.id))
  const segs = segments(availability, ids, rangeStart, rangeEnd)

  // A group may remain free while optional attendees change at a segment boundary.
  // Include intersections across contiguous segments, not only each exact active set.
  const groups = new Map()
  for (let i = 0; i < segs.length; i++) {
    let group = new Set(segs[i].members)
    for (let j = i; j < segs.length; j++) {
      if (j > i && segs[j - 1].end !== segs[j].start) break
      group = new Set([...group].filter((id) => segs[j].members.has(id)))
      if (!group.size || !isSubset(requiredIds, group)) break
      const key = [...group].sort().join(',')
      if (!groups.has(key)) groups.set(key, group)
    }
  }

  const minLen = o.minDurationMins * MIN
  const candidates = []
  for (const group of groups.values()) {
    for (const w of windowsFor(group, segs)) {
      if (w.end - w.start < minLen) continue
      // Split windows that cross midnight into per-day windows.
      for (const piece of splitByDay(w)) {
        if (piece.end - piece.start < minLen) continue
        candidates.push({ ...piece, group })
      }
    }
  }

  // Drop a window if a larger group has the same or a covering window.
  const kept = candidates.filter(
    (c) =>
      !candidates.some(
        (d) => d !== c && d.group.size > c.group.size && isSubset(c.group, d.group) && d.start <= c.start && d.end >= c.end,
      ),
  )

  const total = members.length
  const scored = kept.map((c) => {
    const slot = bestSubSlot(c, o)
    const attendees = ids.filter((id) => c.group.has(id))
    const missing = members.map((m) => m.id).filter((id) => !c.group.has(id))
    const attendance = attendees.length / total
    const usable = Math.min(slot.end - slot.start, o.targetDurationMins * MIN) / (o.targetDurationMins * MIN)
    const pref = preferredFraction(slot.start, slot.end, o)
    const weekend = isWeekend(slot.start) ? 1 : 0
    const score = 0.6 * attendance + 0.2 * usable + 0.15 * pref + 0.05 * weekend
    const reasons = [`${attendees.length} of ${total} can make it`]
    if (missing.length && unknown.length) reasons.push(unknown.length === 1 ? "1 person hasn't replied" : `${unknown.length} people haven't replied`)
    if (pref >= 0.99) reasons.push('at comfortable hours')
    if (weekend) reasons.push('weekend')
    reasons.push(`common free window ${fmtTime(c.start)} to ${fmtTime(c.end)}`)
    return {
      id: `${slot.start}-${slot.end}-${attendees.join('.')}`,
      start: slot.start,
      end: slot.end,
      windowStart: c.start,
      windowEnd: c.end,
      attendees,
      missing,
      score: Math.round(score * 1000) / 1000,
      reasons,
    }
  })

  // Deterministic order: score, then earlier start, then id.
  scored.sort((a, b) => b.score - a.score || a.start - b.start || a.id.localeCompare(b.id))
  const unique = []
  for (const s of scored) {
    if (!unique.some((u) => u.start === s.start && u.end === s.end)) unique.push(s)
    if (unique.length >= o.topN) break
  }
  return { slots: unique, missingRequired, unknown }
}

function splitByDay(w) {
  const out = []
  let s = w.start
  while (s < w.end) {
    const nextDay = sgStartOfDay(s) + 24 * HOUR
    const e = Math.min(w.end, nextDay)
    out.push({ start: s, end: e })
    s = e
  }
  return out
}

/** Baseline for evaluation: the earliest window where every responded member is free. */
export function earliestCommonSlot({ members, availability, rangeStart, rangeEnd, options = {} }) {
  const o = { ...DEFAULTS, ...options }
  const ids = members.filter((m) => m.responded).map((m) => m.id)
  const segs = segments(availability, ids, rangeStart, rangeEnd)
  const all = new Set(ids)
  for (const w of windowsFor(all, segs)) {
    for (const piece of splitByDay(w)) {
      if (piece.end - piece.start >= o.minDurationMins * MIN) {
        const end = Math.min(piece.end, piece.start + o.targetDurationMins * MIN)
        return { start: piece.start, end, attendees: ids, missing: [] }
      }
    }
  }
  return null
}

/** Count of available members per 30-minute cell, for the heatmap. Free time rounded inwards. */
export function heatmap(availability, memberIds, dayStarts, fromMins, toMins) {
  const rounded = {}
  for (const id of memberIds) {
    rounded[id] = (availability[id] || []).map((iv) => roundFreeIn(iv)).filter(Boolean)
  }
  return dayStarts.map((day) => {
    const cells = []
    for (let m = fromMins; m < toMins; m += 30) {
      const s = day + m * MIN
      const e = s + 30 * MIN
      const who = memberIds.filter((id) => rounded[id].some((iv) => iv.start <= s && iv.end >= e))
      cells.push({ start: s, count: who.length, who })
    }
    return { day, cells }
  })
}

/* ---------------- Plain-words summaries ---------------- */

/** "6:20–10:10 pm": the am/pm shows once when both ends share it. */
export function timeSpan(start, end) {
  const a = fmtTime(start)
  const b = fmtTime(end)
  return `${a.slice(-2) === b.slice(-2) ? a.slice(0, -3) : a}–${b}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Mei, Arjun and Farah"; long lists shorten to "Mei, Arjun and 3 others". */
export function joinNames(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`
}

/** "Saturday afternoon, 5 h" */
export function whenText(start, end) {
  const p = sgParts(start)
  const part = p.hour < 12 ? 'morning' : p.hour < 17 ? 'afternoon' : p.hour < 21 ? 'evening' : 'night'
  return `${WEEKDAYS[p.weekday]} ${part}, ${fmtDuration((end - start) / MIN)}`
}

/**
 * The decision facts for a best-time card in one line:
 * "Mei, Arjun and Farah are free · Jun hasn't replied · Saturday afternoon, 5 h".
 */
export function slotHeadline({ start, end, free = [], cant = [], pending = [] }) {
  const parts = []
  if (!cant.length && !pending.length) parts.push(free.length === 1 ? `${free[0]} is free` : 'Everyone is free')
  else if (free.length) parts.push(`${joinNames(free)} ${free.length === 1 ? 'is' : 'are'} free`)
  if (cant.length) parts.push(`${joinNames(cant)} can't make it`)
  if (pending.length) parts.push(`${joinNames(pending)} ${pending.length === 1 ? "hasn't" : "haven't"} replied`)
  parts.push(whenText(start, end))
  return parts.join(' · ')
}

/* ---------------- Rescue a failed schedule ---------------- */

const FLOOR_MINS = 60

/**
 * When no time works for the required people, find honest alternatives the host can choose.
 * Nothing here is applied automatically; each option says what it would change.
 *  - "optional": the best time if one blocking required person were optional instead.
 *  - "without": the same time, locked straight away with that person left out.
 *  - "shorter": the best time that works for everyone who replied, shorter than the usual minimum
 *    (never under one hour).
 * Waiting on required people who have not replied is a calm state, not a failure.
 * @returns {{state:'waiting'|'options'|'none', waiting:string[], options:object[]}}
 */
export function rescueOptions({ members, availability, rangeStart, rangeEnd, options = {} }) {
  const o = { ...DEFAULTS, ...options }
  const waiting = members.filter((m) => m.required && !m.responded).map((m) => m.id)
  const responded = members.filter((m) => m.responded)
  if (waiting.length) return { state: 'waiting', waiting, options: [] }
  if (!responded.length) return { state: 'none', waiting: [], options: [] }
  const common = { availability, rangeStart, rangeEnd }
  const out = []
  const pack = (kind, slot, personId = null) => ({
    id: `${kind}:${personId || ''}:${slot.start}-${slot.end}`,
    kind,
    personId,
    start: slot.start,
    end: slot.end,
    attendees: slot.attendees,
    missing: slot.missing,
    minutes: Math.round((slot.end - slot.start) / MIN),
  })

  for (const p of members.filter((m) => m.required && m.responded && !m.host)) {
    const trial = members.map((m) => (m.id === p.id ? { ...m, required: false } : m))
    const slot = rankSlots({ members: trial, ...common, options: { ...o, topN: 1 } }).slots[0]
    if (slot && !slot.attendees.includes(p.id)) out.push(pack('optional', slot, p.id))
  }

  // Everyone who replied, for less than the usual minimum. Skipped when that minimum is already the floor.
  if (o.minDurationMins > FLOOR_MINS) {
    const strict = members.map((m) => (m.responded ? { ...m, required: true } : m))
    const slot = rankSlots({ members: strict, ...common, options: { ...o, minDurationMins: FLOOR_MINS, topN: 1 } }).slots[0]
    if (slot && slot.end - slot.start < o.minDurationMins * MIN) out.push(pack('shorter', slot))
  }

  const rank = (a, b) => b.attendees.length - a.attendees.length || b.minutes - a.minutes || a.start - b.start || a.id.localeCompare(b.id)
  out.sort(rank)
  const top = out.find((x) => x.kind === 'optional')
  if (top) out.push({ ...top, id: `without:${top.personId}:${top.start}-${top.end}`, kind: 'without' })
  return { state: out.length ? 'options' : 'none', waiting: [], options: out }
}

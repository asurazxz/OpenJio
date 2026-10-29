// Evaluation: the proposed methods against simple baselines on the same curated cases.
// Used by the "How it works" page and by scripts/evaluate.mjs, which writes docs/EVALUATION.md.

import { LISTINGS, AREAS } from '../../data/seed-listings.js'
import { PERSONAS } from '../../data/personas.js'
import { generateItinerary, greedyItinerary, retime, memberScore } from './itinerary.js'
import { rankSlots, earliestCommonSlot } from './slots.js'
import { sgTime, minutesOfDay, isWeekend, HOUR, MIN } from '../time.js'

const area = (slug) => AREAS.find((a) => a.slug === slug)
const people = (...ids) => ids.map((id) => {
  const p = PERSONAS.find((x) => x.id === `u-${id}`)
  return { id: p.id, name: p.name.split(' ')[0], interests: p.interests }
})
const slot = (y, m, d, h1, m1, h2, m2) => ({ start: sgTime(y, m, d, h1, m1), end: sgTime(y, m, d, h2, m2) })

export const ITINERARY_CASES = [
  { id: 'mixed', label: 'Four friends, mixed interests, Saturday afternoon', start: area('city-hall'), slot: slot(2026, 11, 14, 12, 0, 17, 0), members: people('mei', 'arjun', 'farah', 'jun') },
  { id: 'conflict', label: 'Conflicting preferences (games vs museums)', start: area('chinatown'), slot: slot(2026, 11, 14, 14, 0, 19, 0), members: people('arjun', 'farah') },
  { id: 'dinner', label: 'Friday dinner window', start: area('bugis'), slot: slot(2026, 11, 13, 18, 0, 22, 30), members: people('daniel', 'jun', 'mei') },
  { id: 'lunch-deal', label: 'Lunch deals that end mid-afternoon', start: area('orchard'), slot: slot(2026, 11, 15, 11, 0, 16, 0), members: people('jun', 'mei') },
  { id: 'far', label: 'Outer start area with fewer listings', start: area('jurong-east'), slot: slot(2026, 11, 14, 10, 0, 15, 0), members: people('arjun', 'priya', 'farah') },
  { id: 'solo', label: 'Solo Sunday morning', start: area('holland-village'), slot: slot(2026, 11, 15, 9, 0, 13, 0), members: people('priya') },
  { id: 'short', label: 'Slot too short for two stops', start: area('tiong-bahru'), slot: slot(2026, 11, 14, 15, 0, 16, 15), members: people('mei', 'farah') },
  { id: 'night', label: 'Nothing open (2 am to 5 am)', start: area('clarke-quay'), slot: slot(2026, 11, 14, 2, 0, 5, 0), members: people('daniel', 'jun') },
]

function metrics(result, c) {
  const input = { slot: c.slot, start: c.start, candidates: LISTINGS, members: c.members }
  if (!result.ok || !result.stops.length) {
    return { feasible: false, stops: 0, violations: null, travelMins: null, avgSat: null, minSat: null, score: null, note: result.problems?.[0]?.cause || 'No plan' }
  }
  const check = retime(result.stops.map((s) => s.listing), input)
  const per = c.members.map((m) => result.stops.reduce((a, s) => a + memberScore(s.listing, m), 0) / result.stops.length)
  return {
    feasible: true,
    stops: result.stops.length,
    violations: check.issues.length,
    violationTypes: [...new Set(check.issues.map((i) => i.type))],
    travelMins: result.stops.reduce((a, s) => a + s.travelMins, 0),
    avgSat: per.reduce((a, b) => a + b, 0) / per.length,
    minSat: Math.min(...per),
    score: check.score,
    titles: result.stops.map((s) => s.listing.title),
  }
}

function timed(fn) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const r = fn()
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return { r, ms: Math.round((t1 - t0) * 10) / 10 }
}

export function runItineraryEvaluation() {
  return ITINERARY_CASES.map((c) => {
    const input = { slot: c.slot, start: c.start, candidates: LISTINGS, members: c.members }
    const beam = timed(() => generateItinerary(input))
    const greedy = timed(() => greedyItinerary(input))
    return {
      id: c.id,
      label: c.label,
      beam: { ...metrics(beam.r, c), ms: beam.ms },
      greedy: { ...metrics(greedy.r, c), ms: greedy.ms },
    }
  })
}

const day = (d, h1, h2) => ({ start: sgTime(2026, 11, d, h1), end: sgTime(2026, 11, d, h2) })

export const SLOT_CASES = [
  {
    id: 'weekday-morning',
    label: 'Earliest overlap is a weekday morning',
    members: [{ id: 'a', required: true }, { id: 'b' }, { id: 'c' }],
    availability: {
      a: [day(13, 9, 12), day(14, 13, 21)],
      b: [day(13, 9, 12), day(14, 12, 20)],
      c: [day(13, 8, 12), day(14, 14, 22)],
    },
  },
  {
    id: 'partial',
    label: 'Nobody overlaps fully; best partial group',
    members: [{ id: 'a', required: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    availability: {
      a: [day(14, 10, 22)],
      b: [day(14, 10, 14)],
      c: [day(14, 15, 21)],
      d: [day(14, 16, 22)],
    },
  },
  {
    id: 'required',
    label: 'Required member only free on Sunday',
    members: [{ id: 'a' }, { id: 'b', required: true }, { id: 'c' }],
    availability: {
      a: [day(14, 12, 20), day(15, 12, 18)],
      b: [day(15, 11, 19)],
      c: [day(14, 12, 20), day(15, 14, 18)],
    },
  },
]

function slotMetrics(s, c) {
  if (!s) return { found: false }
  const attendees = s.attendees.length
  const requiredOk = c.members.filter((m) => m.required).every((m) => s.attendees.includes(m.id))
  let inPref = 0
  let n = 0
  for (let t = s.start; t < s.end; t += 30 * MIN) {
    const m = minutesOfDay(t)
    n++
    if (m >= 11 * 60 && m < 22 * 60) inPref++
  }
  return { found: true, attendees, of: c.members.length, requiredOk, prefFraction: n ? inPref / n : 0, hours: (s.end - s.start) / HOUR, weekend: isWeekend(s.start), start: s.start, end: s.end }
}

export function runSlotEvaluation() {
  const rangeStart = sgTime(2026, 11, 13)
  const rangeEnd = sgTime(2026, 11, 16)
  return SLOT_CASES.map((c) => {
    const members = c.members.map((m) => ({ ...m, responded: true }))
    const ranked = rankSlots({ members, availability: c.availability, rangeStart, rangeEnd })
    const base = earliestCommonSlot({ members, availability: c.availability, rangeStart, rangeEnd })
    return { id: c.id, label: c.label, ranked: slotMetrics(ranked.slots[0], c), baseline: slotMetrics(base, c) }
  })
}

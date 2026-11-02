import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateItinerary, greedyItinerary, retime, alternativesFor, requiredMeals } from '../src/lib/algo/itinerary.js'
import { sgTime, MIN } from '../src/lib/time.js'

const sat = (h, m = 0) => sgTime(2026, 11, 14, h, m)
const allDay = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '23:00']]]))
const start = { lat: 1.3, lng: 103.85 }
const at = (dLat, dLng) => ({ lat: 1.3 + dLat, lng: 103.85 + dLng })

const L = [
  { id: 'museum', type: 'place', kind: 'activity', interests: ['museums', 'arts'], durationMins: 90, openingHours: allDay, ...at(0.002, 0.001) },
  { id: 'park', type: 'place', kind: 'activity', interests: ['outdoors'], durationMins: 60, openingHours: allDay, ...at(0.004, 0.003) },
  { id: 'hawker', type: 'place', kind: 'meal', interests: ['food'], durationMins: 60, openingHours: allDay, ...at(0.001, 0.002) },
  { id: 'cafe', type: 'place', kind: 'meal', interests: ['cafes', 'food'], durationMins: 45, openingHours: allDay, ...at(0.003, 0.0) },
  { id: 'far-arcade', type: 'place', kind: 'activity', interests: ['games'], durationMins: 90, openingHours: allDay, ...at(0.09, 0.1) },
  { id: 'mystery', type: 'place', kind: 'activity', interests: ['museums'], durationMins: 60, openingHours: null, ...at(0.001, 0.001) },
]
const members = [
  { id: 'a', interests: { museums: 1, food: 0.6 } },
  { id: 'b', interests: { outdoors: 1, cafes: 0.8 } },
]
const base = { slot: { start: sat(12), end: sat(17) }, start, candidates: L, members }

test('generated plan is feasible, includes lunch, and skips unknown hours', () => {
  const r = generateItinerary(base)
  assert.equal(r.ok, true)
  assert.ok(r.stops.length >= 2)
  assert.ok(!r.stops.some((s) => s.listingId === 'mystery'))
  assert.ok(r.stops.some((s) => s.listing.kind === 'meal'))
  for (let i = 1; i < r.stops.length; i++) assert.ok(r.stops[i].start >= r.stops[i - 1].end)
  assert.ok(r.stops[r.stops.length - 1].end <= base.slot.end)
  const check = retime(r.stops.map((s) => s.listing), base)
  assert.equal(check.ok, true, JSON.stringify(check.issues))
})

test('beam scores at least as well as greedy on the same inputs', () => {
  const beam = generateItinerary(base)
  const greedy = greedyItinerary(base)
  assert.ok(beam.score >= greedy.score)
})

test('meal requirement depends on the window', () => {
  assert.equal(requiredMeals({ start: sat(14, 30), end: sat(17) }).length, 0)
  assert.deepEqual(requiredMeals({ start: sat(11), end: sat(16) }).map((m) => m.name), ['lunch'])
})

test('no feasible plan explains the conflict', () => {
  const r = generateItinerary({ ...base, slot: { start: sat(3), end: sat(5) } })
  assert.equal(r.ok, false)
  assert.ok(r.problems.length >= 1)
  assert.ok(r.problems.every((p) => p.cause && p.relax))
})

test('retime flags overruns, closures and double meals', () => {
  const r = retime([L[2], L[3], L[0]], { ...base, slot: { start: sat(12), end: sat(14) } })
  const types = r.issues.map((i) => i.type)
  assert.ok(types.includes('double_meal'))
  assert.ok(types.includes('over_time'))
  const u = retime([L[5]], base)
  assert.ok(u.issues.some((i) => i.type === 'unknown_hours'))
})

test('reasons do not claim a fit or a meal that validation rejects', () => {
  const bad = retime([L[0], L[1]], { ...base, slot: { start: sat(12), end: sat(14) } })
  const types = bad.issues.map((i) => i.type)
  assert.ok(types.includes('over_time') && types.includes('no_meal'))
  assert.ok(!bad.reasons.some((r) => r.startsWith('Fits ')), bad.reasons.join(' | '))
  assert.ok(bad.reasons.some((r) => r.includes('outside your slot')))
  assert.ok(!bad.reasons.some((r) => r.endsWith(' covered')))
  const good = generateItinerary(base)
  assert.ok(good.reasons.some((r) => r.startsWith('Fits ')))
  assert.ok(good.reasons.includes('Lunch covered'))
})

test('alternatives keep the plan feasible and match the stop kind', () => {
  const plan = generateItinerary(base)
  const listings = plan.stops.map((s) => s.listing)
  const idx = listings.findIndex((l) => l.kind === 'meal')
  const alts = alternativesFor(listings, idx, base)
  for (const a of alts) assert.equal(a.listing.kind, 'meal')
})

test('travel minutes are never zero', () => {
  const r = generateItinerary(base)
  for (const s of r.stops) assert.ok(s.travelMins > 0)
  assert.ok(MIN > 0)
})

test('greedy baseline cannot report success without a required meal', () => {
  const r = greedyItinerary({ ...base, candidates: L.filter((l) => l.kind !== 'meal') })
  assert.equal(r.ok, false)
})

test('routing receives each leg actual departure time after the preceding visit', () => {
  const departures = []
  const r = retime([L[0], L[1]], { ...base, options: { mealWanted: false }, travel: (a, b, departMs) => { departures.push(departMs); return { mins: 10, mode: 'walk' } } })
  assert.equal(r.ok, true)
  assert.deepEqual(departures, [sat(12), sat(13, 40)])
})

test('a pool crowded with well-matched restaurants still leaves room for activities', () => {
  // Live place data adds dozens of restaurants; they must not squeeze out every activity.
  const restaurants = Array.from({ length: 40 }, (_, i) => ({ id: `food-${String(i).padStart(2, '0')}`, type: 'place', kind: 'meal', interests: ['food'], durationMins: 60, openingHours: allDay, ...at(0.001 * (i % 5), 0.001) }))
  const activities = L.filter((l) => l.kind !== 'meal')
  const r = generateItinerary({ ...base, candidates: [...restaurants, ...activities], members: [{ id: 'a', interests: { food: 1 } }] })
  assert.equal(r.ok, true)
  assert.ok(r.stops.some((s) => s.listing.kind !== 'meal'))
})

test('stop times are rounded up to 5 minutes and keep their durations', () => {
  const travel = () => ({ mins: 17, mode: 'walk' })
  const r = retime([L[0], L[1]], { ...base, options: { mealWanted: false }, travel })
  // Slot starts at 12:00; 17 minutes of travel becomes 12:20, not 12:17.
  assert.equal(r.stops[0].start, sat(12, 20))
  assert.equal(r.stops[0].end - r.stops[0].start, 90 * MIN)
  assert.equal(r.stops[1].start, sat(14, 10)) // 13:50 end + 17 min = 14:07, rounded up to 14:10
  for (const s of r.stops) assert.equal((s.start / MIN) % 5, 0)
  const g = generateItinerary(base)
  for (const s of g.stops) assert.equal((s.start / MIN) % 5, 0)
})

test('plan reasons call a real deal source-checked but never describe a sample deal as verified', () => {
  const deal = (kind) => ({ id: 'deal-' + kind, type: 'deal', kind: 'activity', interests: ['museums'], durationMins: 60, status: 'published', source: { kind, verifiedAt: '2026-10-29T00:00:00Z' }, ...at(0.001, 0.001) })
  const plan = (kind) => generateItinerary({ ...base, candidates: [...L, deal(kind)], members: [{ id: 'a', interests: { museums: 1 } }] })
  const real = plan('scraped')
  const sample = plan('curated')
  if (real.stops.some((s) => s.listingId === 'deal-scraped')) assert.ok(real.reasons.some((r) => /source-checked deal/.test(r)))
  assert.ok(!sample.reasons.some((r) => /verified|source-checked/.test(r)))
})

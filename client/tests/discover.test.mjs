import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreListing, rankListings, capByKind, listingKind, timelyBoost, DISCOVER_WEIGHTS } from '../src/lib/algo/discover.js'
import { isVerifiedDeal } from '../src/lib/algo/validity.js'

const NOW = Date.parse('2026-11-02T00:00:00Z')
const HERE = { lat: 1.3, lng: 103.855 }
const fresh = { verifiedAt: '2026-11-01T00:00:00Z' }

test('unknown outlet coordinates have no invented distance in Discover', () => {
  const result = scoreListing({ id: 'unknown', type: 'event', lat: null, lng: null, interests: ['arts'] }, { near: { lat: 1.3, lng: 103.8 } })
  assert.equal(result.km, null)
  assert.ok(Number.isFinite(result.score))
})

test('manual-view-only deals are not treated as planning-verified deals', () => {
  assert.equal(isVerifiedDeal({ type: 'deal', status: 'published', routeReady: false, source: { verifiedAt: '2026-10-29T00:00:00Z' } }), false)
})

test('deals, events and open jios get the timeliness lift and places do not', () => {
  assert.equal(timelyBoost({ type: 'deal' }), 1)
  assert.equal(timelyBoost({ type: 'event' }), 1)
  assert.equal(timelyBoost({ type: 'hangout' }), 1)
  assert.equal(timelyBoost({ type: 'place', kind: 'meal' }), 0)
  // The lift is small: 0.08, and only a tie-breaker against the four base weights.
  assert.equal(DISCOVER_WEIGHTS.timely, 0.08)
})

test('identical listings: the deal ranks above the place by exactly the timeliness weight', () => {
  const attrs = { lat: HERE.lat, lng: HERE.lng, interests: ['food'], source: fresh }
  const params = { interests: { food: 1 }, near: HERE, now: NOW }
  const deal = scoreListing({ id: 'd', type: 'deal', ...attrs }, params).score
  const place = scoreListing({ id: 'p', type: 'place', kind: 'meal', ...attrs }, params).score
  assert.ok(Math.abs(deal - place - DISCOVER_WEIGHTS.timely) < 1e-9)
  const ranked = rankListings([
    { id: 'p', type: 'place', kind: 'meal', ...attrs },
    { id: 'd', type: 'deal', ...attrs },
  ], params)
  assert.equal(ranked[0].listing.id, 'd')
})

test('a strongly matching place still outranks a weak time-sensitive listing', () => {
  const params = { interests: { food: 1 }, near: HERE, now: NOW }
  const strongPlace = scoreListing({ id: 'p', type: 'place', kind: 'meal', lat: HERE.lat, lng: HERE.lng, interests: ['food'], source: fresh }, params).score
  const weakDeal = scoreListing({ id: 'd', type: 'deal', lat: 1.45, lng: 103.9, interests: ['arts'], source: fresh }, params).score
  assert.ok(strongPlace > weakDeal)
})

const item = (id, type, kind, rank) => ({ listing: { id, type, kind, interests: [] }, score: 1 - rank / 1000 })

test('listingKind separates places into meal and activity', () => {
  assert.equal(listingKind({ type: 'place', kind: 'meal' }), 'place-meal')
  assert.equal(listingKind({ type: 'place', kind: 'activity' }), 'place-activity')
  assert.equal(listingKind({ type: 'deal' }), 'deal')
  assert.equal(listingKind({ type: 'event' }), 'event')
  assert.equal(listingKind({ type: 'hangout' }), 'hangout')
})

test('round-robin cap spreads a capped list across kinds and keeps rank order', () => {
  // Input is ranked best-first. Kinds in order of first appearance: meal (40), deal (10), event (5), hangout (3), activity (10).
  const input = []
  let rank = 0
  for (let i = 0; i < 40; i++) input.push(item(`meal-${i}`, 'place', 'meal', rank++))
  for (let i = 0; i < 10; i++) input.push(item(`deal-${i}`, 'deal', undefined, rank++))
  for (let i = 0; i < 5; i++) input.push(item(`event-${i}`, 'event', undefined, rank++))
  for (let i = 0; i < 3; i++) input.push(item(`hangout-${i}`, 'hangout', undefined, rank++))
  for (let i = 0; i < 10; i++) input.push(item(`activity-${i}`, 'place', 'activity', rank++))

  const out = capByKind(input, 30)
  assert.equal(out.length, 30)
  const counts = {}
  for (const it of out) counts[listingKind(it.listing)] = (counts[listingKind(it.listing)] || 0) + 1
  // Rounds of one per kind: every event and hangout gets in, and the big kind does not crowd the others out.
  assert.deepEqual(counts, { 'place-meal': 8, deal: 7, event: 5, hangout: 3, 'place-activity': 7 })
  // Each kind keeps its own rank order, and the output is in overall rank order.
  const scores = out.map((it) => it.score)
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a))
  const mealIds = out.filter((it) => listingKind(it.listing) === 'place-meal').map((it) => it.listing.id)
  assert.deepEqual(mealIds, mealIds.map((_, i) => `meal-${i}`))
})

test('round-robin cap returns everything when the list is already within the limit', () => {
  const input = [item('a', 'place', 'meal', 0), item('b', 'deal', undefined, 1)]
  assert.deepEqual(capByKind(input, 30).map((it) => it.listing.id), ['a', 'b'])
})

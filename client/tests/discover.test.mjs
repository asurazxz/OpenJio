import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreListing } from '../src/lib/algo/discover.js'
import { isVerifiedDeal } from '../src/lib/algo/validity.js'

test('unknown outlet coordinates have no invented distance in Discover', () => {
  const result = scoreListing({ id: 'unknown', type: 'event', lat: null, lng: null, interests: ['arts'] }, { near: { lat: 1.3, lng: 103.8 } })
  assert.equal(result.km, null)
  assert.ok(Number.isFinite(result.score))
})

test('manual-view-only deals are not treated as planning-verified deals', () => {
  assert.equal(isVerifiedDeal({ type: 'deal', status: 'published', routeReady: false, source: { verifiedAt: '2026-10-29T00:00:00Z' } }), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefetchLegs, travelFn } from '../src/lib/travel.js'
import { sgTime } from '../src/lib/time.js'

test('live durations use the actual leg departure even within the same hour', async () => {
  const a = { lat: 1.3, lng: 103.85 }
  const b = { lat: 1.35, lng: 103.9 }
  const early = sgTime(2026, 11, 14, 14, 10)
  const late = sgTime(2026, 11, 14, 14, 50)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const q = new URL(url, 'http://localhost')
    return { ok: true, json: async () => q.pathname.endsWith('/health') ? { onemap: 'ok' } : { durationMins: Date.parse(q.searchParams.get('depart')) === early ? 10 : 30 } }
  }
  try {
    await prefetchLegs([a, b], early)
    await prefetchLegs([a, b], late)
    const travel = travelFn(early)
    assert.equal(travel(a, b).mins, 10)
    assert.equal(travel(a, b, late).mins, 30)
    assert.equal(travel(a, b, late).estimate, false)
  } finally { globalThis.fetch = originalFetch }
})

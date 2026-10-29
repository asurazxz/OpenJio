import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinSuggestions } from '../src/lib/algo/reachability.js'
import { sgTime } from '../src/lib/time.js'

const sat = (h, m = 0) => sgTime(2026, 11, 14, h, m)
const stops = [
  { listing: { title: 'A', lat: 1.3, lng: 103.85 }, start: sat(13), end: sat(14, 30) },
  { listing: { title: 'B', lat: 1.31, lng: 103.86 }, start: sat(14, 45), end: sat(16) },
  { listing: { title: 'C', lat: 1.32, lng: 103.87 }, start: sat(16, 15), end: sat(17) },
]
const fixed = (mins) => () => ({ mins, mode: 'pt' })

test('suggests the first stop reached with enough overlap, using travel time', () => {
  const r = joinSuggestions({ stops, from: { lat: 1.35, lng: 103.9 }, departMs: sat(13, 50), travel: fixed(30) })
  assert.equal(r.best.index, 1, 'stop A ends before arrival at 14:20 leaves 10 min, so B')
})

test('no reachable stop gives a clear reason', () => {
  const r = joinSuggestions({ stops, from: { lat: 1.35, lng: 103.9 }, departMs: sat(16, 30), travel: fixed(40) })
  assert.equal(r.best, null)
  assert.ok(r.reason)
})

test('after the outing ends, never send the joiner to the last venue', () => {
  const r = joinSuggestions({ stops, from: { lat: 1.35, lng: 103.9 }, departMs: sat(17, 30), travel: fixed(5) })
  assert.equal(r.best, null)
  assert.match(r.reason, /ended/)
})

test('route failures are skipped rather than treated as zero minutes', () => {
  const r = joinSuggestions({ stops, from: { lat: 1.35, lng: 103.9 }, departMs: sat(13), travel: () => ({ mins: 0, mode: 'pt' }) })
  assert.equal(r.best, null)
})

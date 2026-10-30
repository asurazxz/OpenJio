import test from 'node:test'
import assert from 'node:assert/strict'
import { assessSlot } from '../src/lib/slot-assessment.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 4, 18)
const end = start + 2 * 60 * 60 * 1000
const setup = (opts = {}) => assessSlot({
  slot: { start, end }, members: [{ id: 'a', required: true, responded: true }],
  availability: { a: [{ start, end }] }, rangeStart: start - 86400000, rangeEnd: end + 86400000, ...opts,
})

test('an adjusted slot cannot exceed the existing twelve-hour outing limit', () => {
  const lo = sgTime(2026, 11, 4, 8), hi = sgTime(2026, 11, 4, 22)
  const result = setup({ slot: { start: lo, end: hi }, rangeStart: lo, rangeEnd: hi, availability: { a: [{ start: lo, end: hi }] } })
  assert.equal(result.ok, false)
})

test('accepts exact full coverage and merges adjacent intervals', () => {
  assert.equal(setup().ok, true)
  const result = setup({ availability: { a: [{ start, end: start + 3600000 }, { start: start + 3600000, end }] } })
  assert.equal(result.ok, true)
  assert.deepEqual(result.attendees, ['a'])
})

test('required unavailable or unknown members prevent acceptance', () => {
  const unavailable = setup({ availability: { a: [{ start, end: start + 3600000 }] } })
  assert.equal(unavailable.ok, false)
  assert.deepEqual(unavailable.missingRequired, ['a'])
  const pending = setup({ members: [{ id: 'a', required: true, responded: false }] })
  assert.equal(pending.ok, false)
  assert.deepEqual(pending.unknown, ['a'])
})

test('optional unknown is distinct and does not block', () => {
  const result = setup({ members: [{ id: 'a', required: false, responded: false }] })
  assert.equal(result.ok, true)
  assert.deepEqual(result.unknown, ['a'])
})

test('validates duration, range, order and Singapore day boundary', () => {
  assert.equal(setup({ slot: { start, end: start + 90 * 60000 } }).ok, false)
  assert.equal(setup({ rangeStart: start + 1 }).ok, false)
  assert.equal(setup({ slot: { start: end, end: start } }).ok, false)
  const dayEnd = sgTime(2026, 11, 4 + 1, 0)
  assert.equal(setup({ slot: { start: dayEnd - 3600000, end: dayEnd + 3600000 } }).ok, false)
  assert.equal(setup({ slot: { start: null, end } }).ok, false)
  assert.equal(setup({ slot: {} }).ok, false)
})

test('availability edges snap inward to half-hour cells before coverage', () => {
  const result = setup({ availability: { a: [{ start: start - 1, end: end - 1 }] } })
  assert.equal(result.ok, false)
  assert.deepEqual(result.missingRequired, ['a'])
  const aligned = setup({ availability: { a: [{ start: start - 30 * 60000, end: end + 30 * 60000 }] } })
  assert.equal(aligned.ok, true)
})

test('accepts a full same-day slot ending at midnight', () => {
  const midnight = sgTime(2026, 11, 5, 0)
  const slotStart = midnight - 2 * 60 * 60000
  const result = setup({
    slot: { start: slotStart, end: midnight },
    availability: { a: [{ start: slotStart, end: midnight }] },
    rangeStart: slotStart,
    rangeEnd: midnight,
  })
  assert.equal(result.ok, true)
})

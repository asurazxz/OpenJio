import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankSlots, earliestCommonSlot, subtractBusy, roundBusyOut, roundFreeIn, mergeIntervals } from '../src/lib/algo/slots.js'
import { sgTime, HOUR, MIN } from '../src/lib/time.js'

const sat = (h, m = 0) => sgTime(2026, 11, 14, h, m) // Saturday
const fri = (h, m = 0) => sgTime(2026, 11, 13, h, m)
const range = { rangeStart: fri(0), rangeEnd: sgTime(2026, 11, 16, 0) }

test('no response means unknown, not free', () => {
  const members = [
    { id: 'a', required: true, responded: true },
    { id: 'b', responded: false },
  ]
  const r = rankSlots({ members, availability: { a: [{ start: sat(10), end: sat(20) }] }, ...range })
  assert.equal(r.slots.length, 1)
  assert.deepEqual(r.slots[0].attendees, ['a'])
  assert.deepEqual(r.slots[0].missing, ['b'])
  assert.deepEqual(r.unknown, ['b'])
})

test('required member who has not responded blocks ranking', () => {
  const members = [
    { id: 'a', responded: true },
    { id: 'b', required: true, responded: false },
  ]
  const r = rankSlots({ members, availability: { a: [{ start: sat(10), end: sat(20) }] }, ...range })
  assert.equal(r.slots.length, 0)
  assert.deepEqual(r.missingRequired, ['b'])
})

test('required members are hard constraints; more attendees ranks higher', () => {
  const members = [
    { id: 'host', required: true, responded: true },
    { id: 'b', responded: true },
    { id: 'c', responded: true },
  ]
  const availability = {
    host: [{ start: fri(18), end: fri(23) }, { start: sat(12), end: sat(20) }],
    b: [{ start: sat(13), end: sat(19) }],
    c: [{ start: sat(14), end: sat(20) }, { start: fri(9), end: fri(12) }],
  }
  const r = rankSlots({ members, availability, ...range })
  assert.ok(r.slots.length >= 2)
  assert.deepEqual(r.slots[0].attendees.sort(), ['b', 'c', 'host'])
  assert.equal(r.slots[0].start, sat(14))
  for (const s of r.slots) assert.ok(s.attendees.includes('host'))
  assert.ok(!r.slots.some((s) => s.start === fri(9)), 'window without the host is excluded')
})

test('ranking is deterministic', () => {
  const members = [{ id: 'a', responded: true }, { id: 'b', responded: true }]
  const availability = { a: [{ start: sat(10), end: sat(22) }], b: [{ start: sat(10), end: sat(22) }] }
  const r1 = rankSlots({ members, availability, ...range })
  const r2 = rankSlots({ members, availability: { b: availability.b, a: availability.a }, ...range })
  assert.deepEqual(r1.slots.map((s) => s.id), r2.slots.map((s) => s.id))
})

test('long windows are trimmed to the target length inside preferred hours', () => {
  const members = [{ id: 'a', responded: true }]
  const r = rankSlots({ members, availability: { a: [{ start: sat(6), end: sat(23) }] }, ...range })
  const s = r.slots[0]
  assert.equal(s.end - s.start, 5 * HOUR)
  assert.ok(s.start >= sat(11) && s.end <= sat(22))
})

test('windows shorter than the minimum are dropped', () => {
  const members = [{ id: 'a', responded: true }, { id: 'b', responded: true }]
  const availability = { a: [{ start: sat(10), end: sat(12) }], b: [{ start: sat(11), end: sat(15) }] }
  const r = rankSlots({ members, availability, ...range })
  assert.ok(r.slots.every((s) => s.attendees.length === 1))
})

test('earliest common slot baseline', () => {
  const members = [{ id: 'a', responded: true }, { id: 'b', responded: true }]
  const availability = {
    a: [{ start: fri(9), end: fri(12) }, { start: sat(14), end: sat(20) }],
    b: [{ start: fri(9), end: fri(12) }, { start: sat(14), end: sat(20) }],
  }
  const s = earliestCommonSlot({ members, availability, ...range })
  assert.equal(s.start, fri(9))
})

test('conservative rounding never invents availability', () => {
  const busy = roundBusyOut({ start: sat(10, 10), end: sat(11, 5) })
  assert.equal(busy.start, sat(10))
  assert.equal(busy.end, sat(11, 30))
  const free = roundFreeIn({ start: sat(10, 10), end: sat(11, 5) })
  assert.equal(free.start, sat(10, 30))
  assert.equal(free.end, sat(11))
  assert.equal(roundFreeIn({ start: sat(10, 5), end: sat(10, 25) }), null)
})

test('subtractBusy and merge', () => {
  const free = subtractBusy([{ start: sat(10), end: sat(18) }], [{ start: sat(12), end: sat(13) }])
  assert.deepEqual(free, [{ start: sat(10), end: sat(12) }, { start: sat(13), end: sat(18) }])
  assert.deepEqual(mergeIntervals([{ start: 0, end: 10 }, { start: 10, end: 20 }]), [{ start: 0, end: 20 }])
  assert.equal(30 * MIN, 1800000)
})

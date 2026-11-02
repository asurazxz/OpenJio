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

test('optional attendees changing halfway do not hide a required member full window', () => {
  const r = rankSlots({
    members: [{ id: 'a', required: true, responded: true }, { id: 'b', responded: true }, { id: 'c', responded: true }],
    availability: { a: [{ start: sat(10), end: sat(13) }], b: [{ start: sat(10), end: sat(11, 30) }], c: [{ start: sat(11, 30), end: sat(13) }] },
    ...range,
  })
  assert.deepEqual(r.slots.map(({ start, end, attendees }) => ({ start, end, attendees })), [{ start: sat(10), end: sat(13), attendees: ['a'] }])
})

test('reasons read as plain language', () => {
  const members = [
    { id: 'a', required: true, responded: true },
    { id: 'b', responded: false },
    { id: 'c', responded: false },
  ]
  const r = rankSlots({ members, availability: { a: [{ start: sat(14), end: sat(20) }] }, ...range })
  assert.ok(r.slots[0].reasons.includes("2 people haven't replied"), r.slots[0].reasons.join('; '))
  const one = rankSlots({ members: members.slice(0, 2), availability: { a: [{ start: sat(14), end: sat(20) }] }, ...range })
  assert.ok(one.slots[0].reasons.includes("1 person hasn't replied"))
  assert.ok(!one.slots[0].reasons.some((x) => /not responded|^Weekend|^Within|^Free/.test(x)))
})

// ---- Plain-words headline and rescue options ----
import { slotHeadline, whenText, rescueOptions } from '../src/lib/algo/slots.js'

test('best-time headline names who is free, who cannot and who has not replied', () => {
  const line = slotHeadline({ start: sat(14), end: sat(19), free: ['Mei', 'Arjun', 'Farah'], pending: ['Jun'] })
  assert.equal(line, "Mei, Arjun and Farah are free · Jun hasn't replied · Saturday afternoon, 5 h")
  assert.equal(slotHeadline({ start: sat(19), end: sat(22), free: ['Mei', 'Jun'] }), 'Everyone is free · Saturday evening, 3 h')
  assert.match(slotHeadline({ start: sat(10), end: sat(12), free: ['Mei'], cant: ['Jun (required)', 'Ana'] }), /Mei is free · Jun \(required\) and Ana can't make it/)
  assert.equal(whenText(sat(9), sat(11)), 'Saturday morning, 2 h')
})

const iv = (a, b) => [{ start: sat(a), end: sat(b) }]
const people = (extra = {}) => [
  { id: 'host', required: true, responded: true, host: true },
  { id: 'ana', required: true, responded: true },
  { id: 'jun', required: true, responded: true, ...extra },
]

test('rescue: a blocking required person can be made optional', () => {
  const availability = { host: iv(14, 19), ana: iv(14, 19), jun: iv(8, 11) }
  assert.equal(rankSlots({ members: people(), availability, ...range }).slots.length, 0)
  const r = rescueOptions({ members: people(), availability, ...range })
  assert.equal(r.state, 'options')
  const opt = r.options.find((x) => x.kind === 'optional')
  assert.equal(opt.personId, 'jun')
  assert.equal(opt.start, sat(14))
  assert.deepEqual(opt.attendees.sort(), ['ana', 'host'])
  assert.deepEqual(opt.missing, ['jun'])
  const without = r.options.find((x) => x.kind === 'without')
  assert.equal(without.personId, 'jun')
  // Applying it (making Jun optional) really does produce that time.
  const after = rankSlots({ members: people({ required: false }), availability, ...range })
  assert.equal(after.slots[0].start, opt.start)
})

test('rescue: never offers to make the host optional', () => {
  const members = [{ id: 'host', required: true, responded: true, host: true }, { id: 'ana', required: true, responded: true }]
  const r = rescueOptions({ members, availability: { host: iv(9, 12), ana: iv(15, 18) }, ...range })
  assert.ok(r.options.every((x) => x.personId !== 'host'))
  assert.equal(r.options.find((x) => x.kind === 'optional').personId, 'ana')
})

test('rescue: offers a shorter time that works for everyone who replied', () => {
  const availability = { host: iv(14, 16), ana: iv(15, 17), jun: iv(15, 18) } // overlap 15-16 only
  const r = rescueOptions({ members: people(), availability, ...range })
  const short = r.options.find((x) => x.kind === 'shorter')
  assert.equal(short.start, sat(15))
  assert.equal(short.end, sat(16))
  assert.equal(short.minutes, 60)
  assert.equal(short.attendees.length, 3)
  assert.equal(r.options[0].kind, 'shorter', 'everyone included ranks first')
})

test('rescue: no floor-breaking times and nothing when nobody overlaps at all', () => {
  const availability = { host: iv(14, 16), ana: iv(15, 17), jun: iv(16, 18) } // all-three overlap is zero
  const r = rescueOptions({ members: people(), availability, ...range })
  assert.ok(!r.options.some((x) => x.kind === 'shorter'))
  assert.ok(r.options.every((x) => x.minutes >= 120 || x.kind !== 'optional'))
  const none = rescueOptions({ members: [{ id: 'host', required: true, responded: true, host: true }, { id: 'ana', required: true, responded: true }], availability: { host: iv(9, 11), ana: iv(15, 17) }, ...range })
  assert.ok(!none.options.some((x) => x.kind === 'shorter'))
})

test('rescue: waiting on a required person is a calm state naming them', () => {
  const members = [...people().slice(0, 2), { id: 'jun', required: true, responded: false }]
  const r = rescueOptions({ members, availability: { host: iv(14, 19), ana: iv(14, 19) }, ...range })
  assert.equal(r.state, 'waiting')
  assert.deepEqual(r.waiting, ['jun'])
  assert.equal(r.options.length, 0)
})

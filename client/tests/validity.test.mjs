import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOpenDuring, isDealValidDuring, scheduleAt } from '../src/lib/algo/validity.js'
import { sgTime } from '../src/lib/time.js'

const sat = (h, m = 0) => sgTime(2026, 11, 14, h, m)
const hours = { mon: [], tue: [['10:00', '22:00']], wed: [['10:00', '22:00']], thu: [['10:00', '22:00']], fri: [['10:00', '22:00']], sat: [['11:00', '15:00'], ['17:00', '23:59']], sun: [] }

test('open only when the whole visit fits one window', () => {
  assert.equal(isOpenDuring(hours, sat(12), sat(13)), true)
  assert.equal(isOpenDuring(hours, sat(14, 30), sat(15, 30)), false)
  assert.equal(isOpenDuring(hours, sat(22), sat(24) - 1), true)
})

test('unknown hours are null, not open', () => {
  assert.equal(isOpenDuring(null, sat(12), sat(13)), null)
  const r = scheduleAt({ type: 'place', openingHours: null, durationMins: 60 }, sat(12))
  assert.equal(r.ok, false)
  assert.equal(r.unknown, true)
})

test('deal validity checks dates, weekday and time window', () => {
  const v = { dateFrom: '2026-11-01', dateTo: '2026-11-30', daysOfWeek: ['SAT', 'SUN'], timeWindows: [{ start: '12:00', end: '15:00' }] }
  assert.equal(isDealValidDuring(v, sat(12), sat(13)), true)
  assert.equal(isDealValidDuring(v, sat(14, 30), sat(15, 30)), false, 'deal expiring mid-visit')
  assert.equal(isDealValidDuring(v, sgTime(2026, 11, 13, 12), sgTime(2026, 11, 13, 13)), false, 'Friday')
  assert.equal(isDealValidDuring({ ...v, dateTo: '2026-11-10' }, sat(12), sat(13)), false, 'expired')
})

test('events schedule inside their own times', () => {
  const ev = { type: 'event', startsAt: '2026-11-14T15:00:00+08:00', endsAt: '2026-11-14T18:00:00+08:00', durationMins: 120 }
  const r = scheduleAt(ev, sat(14, 30))
  assert.equal(r.ok, true)
  assert.equal(r.start, sat(15))
  assert.equal(r.waitMins, 30)
  assert.equal(scheduleAt(ev, sat(17, 45)).ok, false)
})

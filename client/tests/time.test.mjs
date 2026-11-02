import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtRange, toMs } from '../src/lib/time.js'

test('a range within one year leaves the year out', () => {
  assert.equal(fmtRange(toMs('2026-11-14T14:00:00+08:00'), toMs('2026-11-14T19:00:00+08:00')), 'Sat 14 Nov, 2 pm to 7 pm')
  assert.equal(fmtRange(toMs('2026-11-14T10:00:00+08:00'), toMs('2026-11-15T22:00:00+08:00')), 'Sat 14 Nov 10 am to Sun 15 Nov 10 pm')
})

test('a range that crosses a year names both years', () => {
  assert.equal(fmtRange(toMs('2026-10-27T10:00:00+08:00'), toMs('2027-09-19T22:00:00+08:00')), 'Tue 27 Oct 2026 10 am to Sun 19 Sep 2027 10 pm')
})

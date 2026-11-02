import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as review from '../src/lib/review.js'
const areas = [{ slug: 'city-hall', label: 'City Hall', lat: 1.29, lng: 103.85 }]
const base = { id: 'test', title: 'Reviewed offer', type: 'deal', area: 'city-hall', source: { url: 'https://example.test/offer' }, validity: { dateFrom: '2026-11-01', dateTo: '2026-11-30', daysOfWeek: ['MON'], timeWindows: [{ start: '12:00', end: '15:00' }] } }
const complete = () => ({ ...base, routeReady: true, lat: 1.2921, lng: 103.8523, address: 'Exact outlet address', durationMins: 60, openingHours: { mon: [['11:00', '20:00']] }, category: 'food', conditions: ['Dine in'], exclusions: [] })
test('manual-only publication keeps unknown coordinates, hours, duration and restrictions without area fallback', () => {
  const listing = review.preparePublication({ ...base, validity: null, conditions: null, exclusions: null }, areas, '2026-10-29T12:00:00+08:00')
  assert.equal(listing.routeReady, false)
  assert.equal(listing.reviewStatus, 'manual-view-only')
  assert.equal(listing.lat, null)
  assert.equal(listing.lng, null)
  assert.equal(listing.openingHours, null)
  assert.equal(listing.durationMins, null)
  assert.equal(listing.validity.dateFrom, null)
  assert.equal(listing.conditions, null)
  assert.ok(listing.unknownFields.includes('lat'))
  assert.ok(listing.unknownFields.includes('conditions'))
})
test('route-ready publication requires known exact route fields and deal restrictions', () => {
  for (const patch of [{ lat: '' }, { lng: null }, { durationMins: null }, { openingHours: null }, { address: '' }, { category: '' }, { validity: { ...base.validity, daysOfWeek: null } }, { validity: { ...base.validity, timeWindows: null } }, { conditions: null }]) {
    assert.throws(() => review.preparePublication({ ...complete(), ...patch }, areas), /route|known|required|address|categor/i)
  }
})
test('review preserves exact venue, opening windows, weekdays, conditions and exclusions', () => {
  const draft = complete()
  const listing = review.preparePublication(draft, areas, '2026-10-29T12:00:00+08:00')
  assert.equal(listing.lat, draft.lat)
  assert.equal(listing.lng, draft.lng)
  assert.deepEqual(listing.openingHours, draft.openingHours)
  assert.deepEqual(listing.validity, draft.validity)
  assert.deepEqual(listing.conditions, draft.conditions)
  assert.deepEqual(listing.exclusions, [])
  assert.equal(listing.routeReady, true)
  assert.equal(listing.source.verifiedAt, '2026-10-29T12:00:00+08:00')
})
test('malformed coordinates, durations and opening windows fail before publication', () => {
  for (const patch of [{ lat: 'NaN' }, { lat: 91 }, { lng: 181 }, { durationMins: -1 }, { durationMins: 1.5 }, { openingHours: { mon: [['25:00', '26:00']] } }, { openingHours: { mon: [['18:00', '12:00']] } }, { openingHours: { unknown: [] } }]) {
    assert.throws(() => review.preparePublication({ ...base, ...patch }, areas), /coordinate|duration|hours|window/i)
  }
})
test('reversed and impossible validity dates or time windows cannot publish even as manual-only', () => {
  for (const validity of [{ ...base.validity, dateFrom: '2026-11-31' }, { ...base.validity, dateTo: '2026-10-01' }, { ...base.validity, daysOfWeek: ['WAT'] }, { ...base.validity, timeWindows: [{ start: '15:00', end: '12:00' }] }]) {
    assert.throws(() => review.preparePublication({ ...base, validity }, areas), /date|day|window/i)
  }
})
test('invalid or reversed event timestamps fail and event route-ready does not invent opening hours', () => {
  for (const endsAt of ['invalid', '2026-11-01T11:00:00+08:00']) assert.throws(() => review.preparePublication({ ...base, type: 'event', startsAt: '2026-11-01T12:00:00+08:00', endsAt }, areas), /event|time/i)
  const listing = review.preparePublication({ ...complete(), type: 'event', startsAt: '2026-11-01T12:00:00+08:00', endsAt: '2026-11-01T14:00:00+08:00', openingHours: null }, areas)
  assert.equal(listing.openingHours, null)
  assert.equal(listing.routeReady, true)
})
test('opening-hours editor preserves unknown weekdays and explicit closed days', () => {
  const form = review.hoursToEditor({ mon: [['11:00', '14:00'], ['18:00', '21:00']], sun: [] })
  assert.equal(form.tue.state, 'unknown')
  assert.equal(form.sun.state, 'closed')
  assert.deepEqual(review.hoursFromEditor(form), { mon: [['11:00', '14:00'], ['18:00', '21:00']], sun: [] })
  assert.equal(review.hoursFromEditor(review.hoursToEditor(null)), null)
})
test('an open day with no windows cannot silently become a confirmed closed day', () => {
  const editor = review.hoursToEditor(null)
  editor.mon.state = 'open'
  assert.throws(() => review.hoursFromEditor(editor), /window/i)
})
test('publication retains non-routing unknown field labels without making those facts up', () => {
  const listing = review.preparePublication({ ...complete(), merchant: null, priceText: null, summary: null }, areas)
  for (const field of ['merchant', 'priceText', 'summary']) assert.ok(listing.unknownFields.includes(field), `${field} stays explicitly unknown`)
  assert.equal(listing.routeReady, true)
})

test('auto-extracted titles in all capitals read as title case and "FREE" reads "Free"', () => {
  assert.equal(review.tidyTitle('FAN SESSION WITH LANY AT THE SINGAPORE POP-UP'), 'Fan Session with Lany at the Singapore Pop-Up')
  assert.equal(review.tidyTitle('1-for-1 Pasta at Pasta Mania'), '1-for-1 Pasta at Pasta Mania')
  assert.equal(review.tidyTitle('ART SG 2027'), 'ART SG 2027')
  assert.equal(review.tidyPrice('FREE'), 'Free')
  assert.equal(review.tidyPrice('Free entry for students'), 'Free entry for students')
})

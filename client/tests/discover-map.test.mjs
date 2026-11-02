import test from 'node:test'
import assert from 'node:assert/strict'
import { whenWindow, pinLabel, keyFact, metaLine, listingIcon } from '../src/lib/algo/discover.js'
import { sgTime, sgStartOfDay, DAY } from '../src/lib/time.js'

// Mon 2 Nov 2026, 3 pm Singapore time.
const MON = sgTime(2026, 11, 2, 15)
const SAT = sgTime(2026, 11, 7, 11)

test('Today runs from now to midnight and Tonight from 6 pm to midnight', () => {
  const midnight = sgStartOfDay(MON) + DAY
  assert.deepEqual(whenWindow('today', MON), { start: MON, end: midnight })
  assert.deepEqual(whenWindow('tonight', MON), { start: sgTime(2026, 11, 2, 18), end: midnight })
  // After 6 pm Tonight starts now.
  const late = sgTime(2026, 11, 2, 20)
  assert.equal(whenWindow('tonight', late).start, late)
})

test('This weekend is Saturday 9 am to Sunday 11 pm, or the rest of it when it is already the weekend', () => {
  assert.deepEqual(whenWindow('weekend', MON), { start: sgTime(2026, 11, 7, 9), end: sgTime(2026, 11, 8, 23) })
  assert.deepEqual(whenWindow('weekend', SAT), { start: SAT, end: sgTime(2026, 11, 8, 23) })
  const sun = sgTime(2026, 11, 8, 10)
  assert.deepEqual(whenWindow('weekend', sun), { start: sun, end: sgTime(2026, 11, 8, 23) })
  assert.equal(whenWindow('any', MON), null)
})

test('pin labels are short and say the offer, the day, the spots or the kind of place', () => {
  assert.equal(pinLabel({ type: 'deal', dealText: '1-for-1 iced kopi' }), '1-for-1')
  assert.equal(pinLabel({ type: 'deal', dealText: '15% off lunch sets' }), '15% off')
  assert.equal(pinLabel({ type: 'deal', dealText: '$2 off wonton mee' }), '$2 off')
  assert.equal(pinLabel({ type: 'deal', dealText: 'Free oat milk upgrade' }), 'Deal')
  assert.equal(pinLabel({ type: 'deal', title: '1-for-1 Sunday Lunch Buffet' }), '1-for-1')
  assert.equal(pinLabel({ type: 'event', startsAt: sgTime(2026, 11, 7, 14) }, MON), 'Sat')
  assert.equal(pinLabel({ type: 'event', startsAt: sgTime(2026, 11, 2, 16) }, MON), 'Today')
  assert.equal(pinLabel({ type: 'event', startsAt: sgTime(2026, 11, 2, 19) }, MON), 'Tonight')
  assert.equal(pinLabel({ type: 'hangout', capacity: 6, memberCount: 3 }), '3 spots')
  assert.equal(pinLabel({ type: 'hangout', capacity: 6, memberCount: 5 }), '1 spot')
  assert.equal(pinLabel({ type: 'hangout', capacity: 6, memberCount: 6 }), 'Full')
  assert.equal(pinLabel({ type: 'place', interests: ['outdoors'] }), 'Park')
  assert.equal(pinLabel({ type: 'place', interests: ['cafes'] }), 'Cafe')
  assert.equal(pinLabel({ type: 'place', interests: [] }), '')
})

test('key facts lead with what a person needs first', () => {
  assert.equal(keyFact({ type: 'deal', dealText: '15% off lunch sets' }), '15% off lunch sets')
  assert.match(keyFact({ type: 'event', startsAt: sgTime(2026, 11, 7, 18) }, MON), /^Sat 6 pm$/)
  assert.match(keyFact({ type: 'hangout', startsAt: sgTime(2026, 11, 7, 18), capacity: 6, memberCount: 4 }, MON), /2 spots left$/)
  const open = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '21:00']]]))
  assert.equal(keyFact({ type: 'place', interests: ['food'], openingHours: open }, MON), 'Open now')
  assert.equal(keyFact({ type: 'place', interests: ['food'] }, MON), 'Eats')
})

test('the preview meta line joins the time or validity with the price', () => {
  assert.equal(metaLine({ type: 'deal', validity: { dateTo: '2026-12-20' }, priceText: 'About $25 per person' }), 'Until Sun 20 Dec · About $25 per person')
  assert.equal(listingIcon({ type: 'deal', interests: ['food'] }), 'deal')
  assert.equal(listingIcon({ type: 'place', interests: ['food'] }), 'food')
  assert.equal(listingIcon({ type: 'place' }), 'place')
})

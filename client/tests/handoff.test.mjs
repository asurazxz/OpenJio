import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildItineraryText, buildIcs, icsEscape, icsFileName, directionsUrl, sourceUrl, bookingChecks, meetingLabel, whenLine, planLink } from '../src/lib/handoff.js'
import { toMs } from '../src/lib/time.js'

const hangout = {
  id: 'h-friday',
  title: 'Friday night makan',
  meetingPoint: 'Bugis MRT, exit C',
  startArea: { slug: 'bugis', label: 'Bugis' },
  lockedSlot: { start: toMs('2026-11-06T18:00:00+08:00'), end: toMs('2026-11-06T23:00:00+08:00') },
}
const stops = [
  { start: toMs('2026-11-06T18:20:00+08:00'), listing: { title: 'Bowl & Co Ramen Egg Deal', address: 'Havelock Road, Singapore 059763', lat: 1.28741, lng: 103.84684, conditions: ['Dine-in only'] } },
  { start: toMs('2026-11-06T19:40:00+08:00'), listing: { title: 'Gardens by the Bay', address: '18 Marina Gardens Drive, Singapore 018953', lat: 1.28158, lng: 103.8636 } },
]
const link = planLink('http://localhost:5173/', 'h-friday')

test('the plan link uses the origin and hangout id', () => {
  assert.equal(link, 'http://localhost:5173/h/h-friday')
})

test('the copied itinerary lists meeting point, stops, checks and the booking line', () => {
  const text = buildItineraryText({ hangout, stops, link }).split('\n')
  assert.deepEqual(text, [
    'Friday night makan · Fri 6 Nov, 6–11 pm',
    'Meet: Bugis MRT, exit C',
    '6:20 pm Bowl & Co Ramen Egg Deal, Havelock Road',
    '7:40 pm Gardens by the Bay, 18 Marina Gardens Drive',
    'Check: Bowl & Co Ramen Egg Deal (Dine-in only)',
    'Nothing is booked through OpenJio.',
    'Plan: http://localhost:5173/h/h-friday',
  ])
})

test('without an exact meeting point the start area is named', () => {
  const h = { ...hangout, meetingPoint: null }
  assert.deepEqual(meetingLabel(h), { exact: false, text: 'Around Bugis' })
  assert.match(buildItineraryText({ hangout: h, stops, link }), /\nMeet: around Bugis\n/)
})

test('time ranges read naturally across am and pm', () => {
  assert.equal(whenLine(toMs('2026-11-06T18:00:00+08:00'), toMs('2026-11-07T01:00:00+08:00')), 'Fri 6 Nov 6 pm to Sat 7 Nov 1 am')
  assert.equal(whenLine(toMs('2026-11-06T11:30:00+08:00'), toMs('2026-11-06T15:00:00+08:00')), 'Fri 6 Nov, 11:30 am–3 pm')
})

test('booking checks come only from stated conditions', () => {
  assert.deepEqual(bookingChecks(stops), [{ title: 'Bowl & Co Ramen Egg Deal', text: 'Dine-in only' }])
  assert.deepEqual(bookingChecks([stops[1]]), [])
})

test('directions use coordinates, then the address; source links must be http(s)', () => {
  assert.equal(directionsUrl(stops[0].listing), 'https://www.google.com/maps/dir/?api=1&destination=1.28741,103.84684')
  assert.match(directionsUrl({ title: 'x', address: '1 Foo Road, Singapore 123456', locationKnown: false }), /destination=1%20Foo%20Road/)
  assert.equal(sourceUrl({ source: { url: 'https://example.com/post' } }), 'https://example.com/post')
  assert.equal(sourceUrl({ bookingUrl: 'https://tix.example.com', source: { url: 'https://example.com/post' } }), 'https://tix.example.com/')
  assert.equal(sourceUrl({ source: { url: 'javascript:alert(1)' } }), '')
  assert.equal(sourceUrl({ source: { url: null } }), '')
})

test('ics escapes commas, semicolons, backslashes and newlines', () => {
  assert.equal(icsEscape('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne')
})

test('the calendar file has one UTC event with CRLF endings and a stable UID', () => {
  const now = toMs('2026-11-01T00:00:00Z')
  const ics = buildIcs({ hangout, stops, link, now })
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'))
  assert.equal(ics.split('BEGIN:VEVENT').length, 2)
  assert.ok(!/[^\r]\n/.test(ics))
  assert.match(ics, /UID:h-friday@openjio\r\n/)
  assert.match(ics, /DTSTART:20261106T100000Z\r\n/)
  assert.match(ics, /DTEND:20261106T150000Z\r\n/)
  assert.match(ics, /SUMMARY:Friday night makan\r\n/)
  assert.match(ics, /LOCATION:Bugis MRT\\, exit C\r\n/)
  assert.equal(buildIcs({ hangout, stops, link, now: now + 5000 }).match(/UID:.*/)[0], ics.match(/UID:.*/)[0])
  const unfolded = ics.replace(/\r\n /g, '')
  assert.match(unfolded, /DESCRIPTION:6:20 pm Bowl & Co Ramen Egg Deal\\, Havelock Road\\n7:40 pm Gardens by the Bay\\, 18 Marina Gardens Drive/)
  assert.match(unfolded, /Plan: http:\/\/localhost:5173\/h\/h-friday/)
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75)
})

test('the file name is the title with unsafe characters removed', () => {
  assert.equal(icsFileName('Friday night makan'), 'Friday night makan.ics')
  assert.equal(icsFileName('a/b:c?'), 'a b c.ics')
  assert.equal(icsFileName(''), 'plan.ics')
})

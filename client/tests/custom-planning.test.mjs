import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiEngine } from '../src/api/engine.js'
import { estimateTravel } from '../src/lib/geo.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 14, 14), end = sgTime(2026, 11, 14, 19)
const cafe = { name: 'Test dessert café', address: '12 Test Street, Singapore', lat: 1.298, lng: 103.851, durationMins: 60, kind: 'activity', providerId: 'geo-example', provider: 'geoapify', openingHoursText: 'Mo-Su 10:00-22:00' }
function fixture() {
  let actor = 'host', serial = 0
  const state = { version: 1, users: ['host', 'member', 'outsider'].map(id => ({ id, name: id, interests: {} })), hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [] }
  const make = () => createApiEngine({ load: () => state, persist() {}, uid: prefix => `${prefix}-${++serial}`, token: () => `invite-${++serial}`, getSessionUserId: () => actor, setSessionUserId: id => { actor = id }, resetDemo() {}, travelFn: () => estimateTravel, prefetchLegs: async () => ({}), fetchDrafts: async () => [], latency: 0 })
  const api = make()
  return { api, state, make, as: id => { actor = id; api.session.userId = id } }
}
async function outing(f, solo = true) {
  const h = await f.api.createHangout({ title: 'Flexible outing', area: 'city-hall', mealWanted: false, ...(solo ? { mode: 'solo', slotStart: start, slotEnd: end } : { dateFrom: '2026-11-14', dateTo: '2026-11-14' }) })
  return h
}

test('an adjusted private slot reports complete attendance and required conflicts before locking', async () => {
  const f = fixture(), h = await outing(f, false)
  await f.api.saveAvailability(h.id, [{ start, end }])
  f.as('member'); await f.api.joinHangout({ token: h.inviteToken })
  f.as('host'); await f.api.setRequired(h.id, 'member', true)
  assert.equal(typeof f.api.previewSlot, 'function')
  let preview = await f.api.previewSlot(h.id, { start, end })
  assert.equal(preview.ok, false)
  assert.deepEqual(preview.unknown, ['member'])
  await assert.rejects(() => f.api.lockSlot(h.id, { start, end }), e => e.code === 'invalid')
  f.as('member'); await f.api.saveAvailability(h.id, [{ start: start + 30 * 60000, end }])
  f.as('host')
  preview = await f.api.previewSlot(h.id, { start: start + 30 * 60000, end: end - 30 * 60000 })
  assert.equal(preview.ok, true)
  assert.deepEqual(preview.attendeeNames.sort(), ['host', 'member'])
  await f.api.lockSlot(h.id, { start: start + 30 * 60000, end: end - 30 * 60000 })
})

test('custom places persist within the itinerary and never become public Discover listings', async () => {
  const f = fixture(), h = await outing(f)
  assert.equal(typeof f.api.addCustomStop, 'function')
  const added = await f.api.addCustomStop(h.id, cafe)
  const plan = await f.make().getPlan(h.id)
  assert.equal(plan.stops[0].listing.title, 'Test dessert café')
  assert.equal(plan.stops[0].listing.id, added.id)
  assert.deepEqual(plan.stops[0].listing.interests, [])
  assert.equal(plan.stops[0].end - plan.stops[0].start, 60 * 60000)
  assert.ok(plan.issues.some(issue => issue.type === 'unknown_hours'))
  assert.ok(!(await f.api.listListings()).some(item => item.id === added.id))
  await assert.rejects(() => f.api.getListing(added.id), e => e.code === 'not_found')
  const second = await outing(f)
  await assert.rejects(() => f.api.setPlanStops(second.id, [added.id]), e => e.code === 'not_found')
  f.as('outsider')
  await assert.rejects(() => f.api.getPlan(h.id), e => e.code === 'forbidden')
})

test('custom stop preview is read-only, checks supplied hours and rejects invalid locations and durations', async () => {
  const f = fixture(), h = await outing(f)
  assert.equal(typeof f.api.previewCustomStop, 'function')
  const result = await f.api.previewCustomStop(h.id, { ...cafe, opens: '10:00', closes: '12:00' })
  assert.ok(result.issues.some(issue => issue.type === 'closed'))
  assert.equal(f.state.itineraries[h.id], undefined)
  for (const patch of [{ lat: 0 }, { lng: NaN }, { durationMins: -1 }, { durationMins: 1000 }, { name: '' }, { opens: '12:00', closes: '10:00' }]) {
    await assert.rejects(() => f.api.addCustomStop(h.id, { ...cafe, ...patch }), e => e.code === 'invalid')
  }
  assert.equal(f.state.itineraries[h.id], undefined)
})

test('only the host may add custom places and route reordering retains their details', async () => {
  const f = fixture(), h = await outing(f, false)
  f.as('member'); await f.api.joinHangout({ token: h.inviteToken })
  await assert.rejects(() => f.api.addCustomStop(h.id, cafe), e => e.code === 'forbidden')
  f.as('host')
  await f.api.saveAvailability(h.id, [{ start, end }])
  await f.api.lockSlot(h.id, { start, end })
  const first = await f.api.addCustomStop(h.id, cafe)
  const second = await f.api.addCustomStop(h.id, { ...cafe, name: 'Another café', providerId: 'other', lat: 1.3 })
  await f.api.setPlanStops(h.id, [second.id, first.id])
  const plan = await f.api.getPlan(h.id)
  assert.deepEqual(plan.stops.map(stop => stop.listing.title), ['Another café', 'Test dessert café'])
  assert.ok(plan.stops[1].start >= plan.stops[0].end)
  assert.equal(plan.stops[1].listing.providerId, 'geo-example')
  await assert.rejects(() => f.api.addCustomStop(h.id, cafe), e => e.code === 'invalid')
  await f.api.setPlanStops(h.id, [second.id])
  const readded = await f.api.addCustomStop(h.id, cafe)
  assert.equal((await f.api.getPlan(h.id)).stops[1].listingId, readded.id)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiEngine } from '../src/api/engine.js'
import { estimateTravel } from '../src/lib/geo.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 14, 14), end = sgTime(2026, 11, 14, 19)

function fixture() {
  let actor = 'host', serial = 0, writes = 0, drafts = []
  const state = { version: 1, users: [{ id: 'host', name: 'host', interests: {} }], hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [] }
  const api = createApiEngine({
    load: () => state, persist() { writes++ }, uid: prefix => `${prefix}-${++serial}`, token: () => `invite-${++serial}`,
    getSessionUserId: () => actor, setSessionUserId: id => { actor = id }, resetDemo() {},
    travelFn: () => estimateTravel, prefetchLegs: async () => ({}), fetchDrafts: async () => drafts, latency: 0,
  })
  return { api, state, writes: () => writes, setDrafts: value => { drafts = value } }
}

test('viewing an ended plan never rewrites its saved timings', async () => {
  const f = fixture()
  const h = await f.api.createHangout({ title: 'Solo', area: 'bugis', mode: 'solo', mealWanted: false, slotStart: start, slotEnd: end })
  await f.api.generatePlan(h.id)
  await f.api.getPlan(h.id)
  const plan = f.state.itineraries[h.id]
  assert.ok(plan.stops.length > 0)
  await f.api.setStage(h.id, 'ended')
  // Simulate saved timings drifting from a fresh retime.
  plan.stops[0].scheduledStart += 60000
  const saved = structuredClone(plan.stops)
  const before = f.writes()
  const view = await f.api.getPlan(h.id)
  assert.equal(f.writes(), before)
  assert.deepEqual(plan.stops, saved)
  assert.ok(view.stops.length > 0)
})

test('custom start points must be real Singapore coordinates with a label', async () => {
  const f = fixture()
  const base = { title: 'Custom', mode: 'solo', slotStart: start, slotEnd: end }
  await assert.rejects(() => f.api.createHangout({ ...base, startArea: { lat: 1.3 } }), e => e.code === 'invalid')
  await assert.rejects(() => f.api.createHangout({ ...base, startArea: { lat: 51.5, lng: -0.12, label: 'London' } }), e => e.code === 'invalid')
  await assert.rejects(() => f.api.createHangout({ ...base, startArea: { lat: 1.3, lng: 103.85, label: '  ' } }), e => e.code === 'invalid')
  const h = await f.api.createHangout({ ...base, startArea: { lat: '1.3', lng: '103.85', label: 'x'.repeat(200), slug: 'spoofed' } })
  assert.deepEqual(h.startArea, { slug: 'custom', label: 'x'.repeat(80), lat: 1.3, lng: 103.85 })
})

test('hangout interests keep only known interest slugs', async () => {
  const f = fixture()
  const h = await f.api.createHangout({ title: 'Picky', area: 'bugis', mode: 'solo', slotStart: start, slotEnd: end, interests: ['food', 'food', 'not-real', { slug: 'cafes' }, 'cafes'] })
  assert.deepEqual(h.interests, ['food', 'cafes'])
  const none = await f.api.createHangout({ title: 'None', area: 'bugis', mode: 'solo', slotStart: start, slotEnd: end, interests: 'food' })
  assert.deepEqual(none.interests, [])
})

test('profile updates validate the home area and reject a missing patch', async () => {
  const f = fixture()
  await assert.rejects(() => f.api.updateProfile(), e => e.code === 'invalid')
  await assert.rejects(() => f.api.updateProfile({ homeArea: { evil: true } }), e => e.code === 'invalid')
  await assert.rejects(() => f.api.updateProfile({ homeArea: 'atlantis', name: 'Renamed' }), e => e.code === 'invalid')
  assert.equal(f.state.users[0].name, 'host')
  assert.equal((await f.api.updateProfile({ homeArea: 'bugis' })).homeArea, 'bugis')
  assert.equal((await f.api.updateProfile({ homeArea: '' })).homeArea, null)
})

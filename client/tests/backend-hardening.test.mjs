import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiEngine } from '../src/api/engine.js'
import { estimateTravel } from '../src/lib/geo.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 14, 14), end = sgTime(2026, 11, 14, 19)

function fixture() {
  let actor = 'host', serial = 0, writes = 0, drafts = []
  const state = { version: 1, users: [{ id: 'host', name: 'host', interests: {}, reviewer: true }], hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [], reviews: {} }
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

test('an edited source post withdraws its publication and returns to review', async () => {
  const f = fixture()
  const draft = { id: 'd1', status: 'draft', type: 'deal', title: 'Old offer', area: 'bugis', source: { kind: 'scraped', url: 'https://example.test/1' } }
  f.setDrafts([draft])
  const listing = await f.api.publishDraft(draft)
  assert.ok(f.state.published.some(l => l.id === listing.id))
  // The post is edited after it was reviewed, and reviewed again afterwards.
  await new Promise(resolve => setTimeout(resolve, 5))
  f.setDrafts([{ ...draft, title: 'Changed offer', sourceEditedAt: new Date(f.state.reviews.d1.at + 1).toISOString() }])
  const queue = await f.api.listDrafts()
  assert.equal(queue.drafts[0].review, null)
  assert.ok(!queue.published.some(l => l.id === listing.id))
  assert.equal(f.state.reviews.d1.previousReview.status, 'published')
  // Publishing again after the edit sticks.
  await new Promise(resolve => setTimeout(resolve, 5))
  await f.api.publishDraft({ id: 'd1' })
  assert.equal((await f.api.listDrafts()).drafts[0].review.status, 'published')
})

test('publishing uses the pipeline draft, not provenance supplied by the caller', async () => {
  const f = fixture()
  f.setDrafts([{ id: 'd1', status: 'draft', type: 'deal', title: 'Real', area: 'bugis', rawPostId: 'telegram:x:1', source: { kind: 'scraped', url: 'https://example.test/1' } }])
  await assert.rejects(() => f.api.publishDraft({ id: 'made-up', title: 'Fake', area: 'bugis', type: 'deal' }), e => e.code === 'not_found')
  const listing = await f.api.publishDraft({ id: 'd1', title: 'Corrected', rawPostId: 'spoofed', source: { url: 'https://spoofed.example' } })
  assert.equal(listing.title, 'Corrected')
  assert.equal(listing.rawPostId, 'telegram:x:1')
  assert.equal(listing.source.url, 'https://example.test/1')
})

import { test, beforeEach } from 'node:test'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { sgTime } from '../src/lib/time.js'

// Browser persistence is the external boundary; all API rules and planning stay real.
function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
}
globalThis.localStorage = memoryStorage()
globalThis.sessionStorage = memoryStorage()
const { default: api } = await import('../src/api/demo.js')
const { load } = await import('../src/api/store.js')
const sat = (h, m = 0) => sgTime(2026, 11, 14, h, m)
let h
beforeEach(async () => {
  api.resetDemo()
  await api.signIn('u-mei')
  h = await api.createHangout({ title: 'Regression outing', area: 'city-hall', dateFrom: '2026-11-14', dateTo: '2026-11-14', mealWanted: false })
  await api.saveAvailability(h.id, [{ start: sat(10), end: sat(20) }])
})
async function addMember() {
  await api.signIn('u-jun')
  await api.joinHangout({ token: h.inviteToken })
}
async function plan() {
  await api.signIn('u-mei')
  await api.lockSlot(h.id, { start: sat(14, 30), end: sat(19) })
  const listings = await api.listListings()
  const activities = listings.filter((l) => l.type === 'place' && l.kind !== 'meal' && l.openingHours && l.durationMins <= 90)
  const ids = activities.slice(0, 2).map((l) => l.id)
  assert.equal(ids.length, 2)
  await api.setPlanStops(h.id, ids)
  return api.getPlan(h.id)
}

test('leaving removes preferences and votes, including after rejoining', async () => {
  await addMember()
  await api.savePreferences(h.id, { games: 1 })
  const p = await plan()
  await api.signIn('u-jun')
  await api.vote(h.id, p.stops[0].id, 1)
  await api.leaveHangout(h.id)
  await api.joinHangout({ token: h.inviteToken })
  const view = await api.getHangout(h.id)
  assert.equal(view.myPrefs, null)
  assert.equal((await api.getPlan(h.id)).stops[0].votes.up, 0)
})

test('legacy votes from nonmembers do not contribute to a stop tally', async () => {
  const p = await plan()
  load().votes[p.stops[0].id] = { 'u-jun': { value: 1, version: p.stops[0].version } }
  assert.equal((await api.getPlan(h.id)).stops[0].votes.voted, 0)
})

test('moving the locked slot invalidates votes on unchanged stop listings', async () => {
  const p = await plan()
  await api.vote(h.id, p.stops[0].id, 1)
  await api.lockSlot(h.id, { start: sat(15), end: sat(19) })
  const changed = await api.getPlan(h.id)
  assert.equal(changed.stops[0].myVote, 0)
  assert.equal(changed.stops[0].votes.voted, 0)
})

test('private plan explanations exclude members unavailable for the locked slot', async () => {
  await addMember()
  await api.saveAvailability(h.id, [{ start: sat(10), end: sat(12) }])
  const p = await plan()
  assert.ok(!p.reasons.some((r) => r.includes('of 2 members')), p.reasons.join('; '))
})

for (const stage of ['ended', 'cancelled']) {
  test(`${stage} hangouts cannot resume planning or change availability`, async () => {
    const p = await plan()
    await api.setStage(h.id, stage)
    const actions = [
      () => api.lockSlot(h.id, { start: sat(15), end: sat(19) }),
      () => api.unlockSlot(h.id),
      () => api.setPlanStops(h.id, p.stops.map((st) => st.listingId)),
      () => api.generatePlan(h.id),
      () => api.finalizePlan(h.id),
      () => api.reopenVoting(h.id),
      () => api.clearAvailability(h.id),
      () => api.lateJoin(h.id, { from: { lat: 1.3, lng: 103.8 }, departMs: sat(15) }),
      () => api.savePreferences(h.id, { food: 1 }),
      () => api.addToShortlist(h.id, p.stops[0].listingId),
    ]
    for (const action of actions) await assert.rejects(action, (err) => err.code === 'closed')
    assert.equal((await api.getHangout(h.id)).hangout.stage, stage)
  })
}

test('replacing an earlier stop invalidates a later stop vote when its time changes', async () => {
  const p = await plan()
  await api.vote(h.id, p.stops[1].id, 1)
  const alternatives = (await api.listListings()).filter((l) => l.type === 'place' && l.kind !== 'meal' && l.openingHours && !p.stops.some((st) => st.listingId === l.id))
  const replacement = alternatives.find((l) => l.durationMins !== p.stops[0].listing.durationMins)
  assert.ok(replacement)
  await api.setPlanStops(h.id, [replacement.id, p.stops[1].listingId])
  const changed = await api.getPlan(h.id)
  assert.notEqual(changed.stops[1].start, p.stops[1].start)
  assert.equal(changed.stops[1].myVote, 0)
})

test('late join fetches direct routes from the joiner origin to every remaining stop', async () => {
  const p = await plan()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).includes('/health') ? { onemap: 'ok' } : { durationMins: 5 } })
  try {
    const r = await api.lateJoin(h.id, { from: { lat: 1.312345, lng: 103.823456 }, departMs: sat(14, 30) })
    assert.equal(r.options.length, p.stops.length)
    assert.ok(r.options.every((o) => o.estimate === false), 'every suggested direct route uses the live response')
  } finally { globalThis.fetch = originalFetch }
})

test('generation does not publish a schedule that live route refinement makes infeasible', async () => {
  await api.lockSlot(h.id, { start: sat(14, 30), end: sat(19) })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ durationMins: 600, onemap: 'ok' }) })
  try {
    const r = await api.generatePlan(h.id)
    assert.equal(r.ok, false)
    assert.ok(r.problems.length > 0)
    assert.equal((await api.getPlan(h.id)).stops.length, 0)
  } finally { globalThis.fetch = originalFetch }
})

test('live refinement requests the second route at the refined first stop departure', async () => {
  const custom = await api.createHangout({ title: 'Route timing', mode: 'solo', startArea: { label: 'Custom origin', lat: 1.44, lng: 104.05 }, slotStart: sat(14, 30), slotEnd: sat(18), mealWanted: false })
  const hours = { sat: [['09:00', '23:00']] }
  load().published.push(...[1, 2].map((i) => ({ id: `routing-fixture-${i}`, title: `Activity ${i}`, type: 'place', kind: 'activity', status: 'published', interests: ['games'], lat: 1.44 + i * 0.001, lng: 104.05, durationMins: 60, openingHours: hours })))
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    if (String(url).includes('/route?')) requests.push(new URL(url, 'http://localhost'))
    return { ok: true, json: async () => ({ durationMins: 20, onemap: 'ok' }) }
  }
  try {
    assert.equal((await api.generatePlan(custom.id)).ok, true)
    const p = await api.getPlan(custom.id)
    assert.equal(requests.length, 2)
    assert.equal(Date.parse(requests[1].searchParams.get('depart')), p.stops[0].end)
    assert.ok(p.stops.every((st) => st.travelEstimate === false))
  } finally { globalThis.fetch = originalFetch }
})


test('a finalized live-routed plan keeps its accepted schedule after a fresh browser module load', async () => {
  const custom = await api.createHangout({ title: 'Persistent routes', mode: 'solo', startArea: { label: 'Persistent origin', lat: 1.45, lng: 104.06 }, slotStart: sat(14, 30), slotEnd: sat(18), mealWanted: false })
  load().published.push(...[1, 2].map((i) => ({ id: `persistent-fixture-${i}`, title: `Persistent activity ${i}`, type: 'place', kind: 'activity', status: 'published', interests: ['games'], lat: 1.45 + i * 0.001, lng: 104.06, durationMins: 60, openingHours: { sat: [['09:00', '23:00']] } })))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ durationMins: 20, onemap: 'ok' }) })
  try {
    assert.equal((await api.generatePlan(custom.id)).ok, true)
    await api.finalizePlan(custom.id)
    const expected = await api.getPlan(custom.id)
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      const fixture=JSON.parse(fs.readFileSync(0,'utf8'));
      const storage=new Map([['openjio:demo:v1',JSON.stringify(fixture.state)],['openjio:session','u-mei']]);
      globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
      globalThis.sessionStorage=globalThis.localStorage;
      const {default:api}=await import(${JSON.stringify(new URL('../src/api/demo.js', import.meta.url).href)});
      const plan=await api.getPlan(fixture.id);
      console.log(JSON.stringify({stage:(await api.getHangout(fixture.id)).hangout.stage,finalizedAt:plan.finalizedAt,stops:plan.stops.map(s=>({start:s.start,end:s.end,travelMins:s.travelMins,travelEstimate:s.travelEstimate}))}));
    `], { input: JSON.stringify({ id: custom.id, state: load() }), encoding: 'utf8', timeout: 10000 })
    assert.equal(child.status, 0, child.stderr)
    const restored = JSON.parse(child.stdout)
    assert.equal(restored.stage, 'final')
    assert.equal(restored.finalizedAt, expected.finalizedAt)
    assert.deepEqual(restored.stops, expected.stops.map(s => ({ start:s.start,end:s.end,travelMins:s.travelMins,travelEstimate:s.travelEstimate })))
  } finally { globalThis.fetch = originalFetch }
})


test('finalizing a manual plan captures live durations adopted after its initial save', async () => {
  const custom = await api.createHangout({ title: 'Manual persistent routes', mode: 'solo', startArea: { label: 'Manual origin', lat: 1.46, lng: 104.07 }, slotStart: sat(14, 30), slotEnd: sat(18), mealWanted: false })
  const fixtures = [1, 2].map((i) => ({ id: `manual-persistent-${i}`, title: `Manual activity ${i}`, type: 'place', kind: 'activity', status: 'published', interests: ['games'], lat: 1.46 + i * 0.001, lng: 104.07, durationMins: 60, openingHours: { sat: [['09:00', '23:00']] } }))
  load().published.push(...fixtures)
  await api.setPlanStops(custom.id, fixtures.map(l => l.id))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ durationMins: 20, onemap: 'ok' }) })
  try {
    await api.lateJoin(custom.id, { from: custom.startArea, departMs: custom.lockedSlot.start })
    await api.getPlan(custom.id)
    await api.finalizePlan(custom.id)
    const expected = await api.getPlan(custom.id)
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      const fixture=JSON.parse(fs.readFileSync(0,'utf8'));
      const storage=new Map([['openjio:demo:v1',JSON.stringify(fixture.state)],['openjio:session','u-mei']]);
      globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
      globalThis.sessionStorage=globalThis.localStorage;
      const {default:api}=await import(${JSON.stringify(new URL('../src/api/demo.js', import.meta.url).href)});
      const plan=await api.getPlan(fixture.id);
      console.log(JSON.stringify({stage:(await api.getHangout(fixture.id)).hangout.stage,start:plan.stops[0].start,finalizedAt:plan.finalizedAt}));
    `], { input: JSON.stringify({ id: custom.id, state: load() }), encoding: 'utf8', timeout: 10000 })
    assert.equal(child.status, 0, child.stderr)
    const restored = JSON.parse(child.stdout)
    assert.equal(restored.stage, 'final')
    assert.equal(restored.start, expected.stops[0].start)
    assert.equal(restored.finalizedAt, expected.finalizedAt)
  } finally { globalThis.fetch = originalFetch }
})

test('hosts can correct basic details while members cannot and closed hangouts stay immutable', async () => {
  await api.updateHangout(h.id, { title: 'Corrected title', area: 'bugis', description: 'Meet by the station' })
  assert.equal((await api.getHangout(h.id)).hangout.title, 'Corrected title')
  assert.equal((await api.getHangout(h.id)).hangout.startArea.slug, 'bugis')
  await addMember()
  await assert.rejects(() => api.updateHangout(h.id, { title: 'Not the host' }), e => e.code === 'forbidden')
  await api.signIn('u-mei')
  await api.setStage(h.id, 'cancelled')
  await assert.rejects(() => api.updateHangout(h.id, { title: 'Closed' }), e => e.code === 'closed')
})

test('changing collection dates resets old availability and keeps changes atomic on invalid input', async () => {
  await assert.rejects(() => api.updateHangout(h.id, { title: 'Must not save', dateFrom: '2026-11-20', dateTo: '2026-11-14' }))
  assert.equal((await api.getHangout(h.id)).hangout.title, 'Regression outing')
  await api.updateHangout(h.id, { dateFrom: '2026-11-15', dateTo: '2026-11-15' })
  const detail = await api.getHangout(h.id)
  assert.deepEqual(detail.myAvailability, [])
  assert.equal(detail.me.respondedAt, null)
})

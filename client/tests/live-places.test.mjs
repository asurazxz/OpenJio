import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiEngine } from '../src/api/engine.js'
import { estimateTravel } from '../src/lib/geo.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 14, 14), end = sgTime(2026, 11, 14, 19)
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PLACES_KEY = 'openjio:places:v1'

// Same shape as the demo's localStorage adapter: guarded, and it keeps the last good list.
function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}
function placesStorageOver(local) {
  return {
    read() { try { return JSON.parse(local.getItem(PLACES_KEY) || 'null') } catch { return null } },
    write(places) { try { local.setItem(PLACES_KEY, JSON.stringify(places)) } catch { /* unavailable */ } },
  }
}

// A place the server would serve: OpenStreetMap, route-ready, open most of the day.
function osmPlace(id, extra = {}) {
  return {
    id: `osm-${id}`, type: 'place', kind: 'activity', title: `Place ${id}`, summary: 'A test place.',
    interests: ['arts'], area: 'bugis', address: '1 Test Road', lat: 1.3006, lng: 103.8556,
    durationMins: 60, durationDefault: true, priceLevel: 0, priceText: 'Free',
    openingHours: Object.fromEntries(DAYS.map((d) => [d, [['09:00', '23:00']]])),
    openingHoursText: 'Daily 09:00-23:00',
    source: { kind: 'osm', name: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${id}`, retrievedAt: new Date().toISOString() },
    routeReady: true, status: 'published',
    ...extra,
  }
}

function freshState() {
  return { version: 1, users: [{ id: 'host', name: 'host', interests: { arts: 0.9 } }], hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [] }
}

// One engine instance over a shared state, the way a page reload creates a new one.
function engine({ state, fetchPlaces, placesStorage, catalogue = [] }) {
  let serial = 0
  return createApiEngine({
    load: () => state, persist() {}, uid: (prefix) => `${prefix}-${++serial}`, token: () => `invite-${++serial}`,
    getSessionUserId: () => 'host', setSessionUserId() {}, resetDemo() {},
    travelFn: () => estimateTravel, prefetchLegs: async () => ({}),
    fetchDrafts: async () => [],
    fetchPlaces, placesStorage, catalogue,
    latency: 0,
  })
}

async function soloHangout(api) {
  return api.createHangout({ title: 'Solo afternoon', area: 'bugis', mode: 'solo', mealWanted: false, slotStart: start, slotEnd: end })
}

test('live places appear in listListings and getListing, de-duplicated by id', async () => {
  const state = freshState()
  const api = engine({ state, fetchPlaces: async () => [osmPlace('a'), osmPlace('a'), osmPlace('b')] })
  const listings = await api.listListings()
  const osm = listings.filter((l) => l.id.startsWith('osm-'))
  assert.deepEqual(osm.map((l) => l.id), ['osm-a', 'osm-b'])
  assert.equal(osm[0].source.kind, 'osm')
  assert.equal(osm[0].durationDefault, true)
  assert.equal(osm[0].openingHoursText, 'Daily 09:00-23:00')
  assert.equal((await api.getListing('osm-b')).title, 'Place b')
  assert.equal(state.published.length, 0, 'live places are never written to shared state')
})

test('a live place naming the same nearby venue as a curated listing is not listed twice', async () => {
  const state = freshState()
  const sample = { ...osmPlace('x'), id: 'pl-garden', title: 'The Garden', source: { kind: 'sample' } }
  const twin = osmPlace('garden', { title: 'Garden', lat: sample.lat + 0.0005 })
  const elsewhere = osmPlace('garden-east', { title: 'Garden', lat: sample.lat + 0.05 })
  const api = engine({ state, catalogue: [sample], fetchPlaces: async () => [twin, elsewhere, osmPlace('b')] })
  const ids = (await api.listListings()).map((l) => l.id)
  assert.ok(ids.includes('pl-garden'))
  assert.ok(!ids.includes('osm-garden'), 'the nearby twin is dropped')
  assert.ok(ids.includes('osm-garden-east'), 'a same-named place far away is a different venue')
  assert.ok(ids.includes('osm-b'))
  assert.equal((await api.getListing('osm-garden')).title, 'Garden', 'plans that already use the twin still resolve it')
})

test('generatePlan can use a live place as a stop', async () => {
  const state = freshState()
  const api = engine({ state, fetchPlaces: async () => [osmPlace('a', { interests: ['arts'] }), osmPlace('b', { interests: ['outdoors'] }), osmPlace('c', { interests: ['shopping'] })] })
  const h = await soloHangout(api)
  const result = await api.generatePlan(h.id)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const stopIds = state.itineraries[h.id].stops.map((stop) => stop.listingId)
  assert.ok(stopIds.some((id) => id.startsWith('osm-')), `expected an osm stop, got ${stopIds.join(', ')}`)
  const plan = await api.getPlan(h.id)
  assert.ok(!plan.broken)
  assert.ok(plan.stops.some((st) => st.listing.id.startsWith('osm-')))
})

test('saved plans keep resolving from the saved place list when the server is down later', async () => {
  const local = memoryStorage()
  const state = freshState()
  const places = [osmPlace('a', { interests: ['arts'] }), osmPlace('b', { interests: ['outdoors'] }), osmPlace('c', { interests: ['shopping'] })]
  const first = engine({ state, fetchPlaces: async () => places, placesStorage: placesStorageOver(local) })
  const h = await soloHangout(first)
  assert.equal((await first.generatePlan(h.id)).ok, true)
  assert.ok(local.getItem(PLACES_KEY), 'the last good list is saved for later reloads')

  // A later page load while the server is unreachable.
  const later = engine({ state, fetchPlaces: async () => { throw new Error('offline') }, placesStorage: placesStorageOver(local) })
  const plan = await later.getPlan(h.id)
  assert.ok(!plan.broken, 'stop still resolves')
  assert.ok(plan.stops.length > 0)
  assert.ok(plan.stops.some((st) => st.listing.id.startsWith('osm-')))
  const osmStop = state.itineraries[h.id].stops.find((stop) => stop.listingId.startsWith('osm-')).listingId
  assert.equal((await later.getListing(osmStop)).source.kind, 'osm')
  assert.ok((await later.listListings()).some((l) => l.id === osmStop))
})

test('an unreachable server with nothing saved yields no live places and no errors', async () => {
  const state = freshState()
  const api = engine({ state, fetchPlaces: async () => { throw new Error('offline') }, placesStorage: placesStorageOver(memoryStorage()) })
  const listings = await api.listListings()
  assert.ok(!listings.some((l) => l.id.startsWith('osm-')))
  await assert.rejects(() => api.getListing('osm-missing'), (e) => e.code === 'not_found')
})

test('corrupt saved place data is ignored', async () => {
  const local = memoryStorage()
  local.setItem(PLACES_KEY, '{not json')
  const api = engine({ state: freshState(), fetchPlaces: async () => { throw new Error('offline') }, placesStorage: placesStorageOver(local) })
  const listings = await api.listListings()
  assert.ok(!listings.some((l) => l.id.startsWith('osm-')))
})

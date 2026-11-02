import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiEngine } from '../src/api/engine.js'
import { estimateTravel } from '../src/lib/geo.js'
import { sgTime } from '../src/lib/time.js'

const start = sgTime(2026, 11, 14, 14), end = sgTime(2026, 11, 14, 19)
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

// A complete pipeline draft the server would mark as auto-publishable.
function autoDraft(extra = {}) {
  return {
    id: 'a1', status: 'draft', type: 'deal', title: 'Kopi and kaya set', merchant: 'Kopi House', summary: 'Breakfast set for two.',
    outlets: [{ name: 'Kopi House', address: '1 Bugis St' }], validity: { dateFrom: null, dateTo: isoDay(365) },
    startsAt: null, endsAt: null, conditions: ['Dine-in only'], exclusions: null, priceText: '$12 for two', category: 'food',
    dealText: '20% off the set', unknownFields: [], area: 'bugis', lat: 1.3006, lng: 103.8556, address: '1 Bugis St, Singapore 188000',
    autoPublish: true, autoCheckedAt: new Date().toISOString(), rawPostId: 'telegram:sgfooddeals:1',
    source: { kind: 'scraped', name: '@sgfooddeals', url: 'https://t.me/sgfooddeals/1', retrievedAt: new Date().toISOString(), postedAt: new Date().toISOString() },
    ...extra,
  }
}

function fixture(initial = []) {
  let actor = 'host', serial = 0, writes = 0, drafts = initial, failing = false, fetches = 0
  const state = { version: 1, users: [{ id: 'host', name: 'host', interests: {} }], hangouts: [], members: [], availability: {}, prefs: {}, itineraries: {}, votes: {}, published: [] }
  const api = createApiEngine({
    load: () => state, persist() { writes++ }, uid: prefix => `${prefix}-${++serial}`, token: () => `invite-${++serial}`,
    getSessionUserId: () => actor, setSessionUserId: id => { actor = id }, resetDemo() {},
    travelFn: () => estimateTravel, prefetchLegs: async () => ({}),
    fetchDrafts: async () => { fetches++; if (failing) throw new Error('offline'); return drafts },
    latency: 0,
  })
  return {
    api, state, writes: () => writes, fetches: () => fetches,
    setDrafts: value => { drafts = value }, setFailing: value => { failing = value },
  }
}

test('a complete auto draft is listed as auto-extracted and manual-view-only, without being persisted', async () => {
  const f = fixture([autoDraft()])
  const before = f.writes()
  const listings = await f.api.listListings()
  assert.equal(f.writes(), before)
  const auto = listings.find(l => l.id === 'pub-a1')
  assert.ok(auto, 'auto listing present')
  assert.equal(auto.autoPublished, true)
  assert.equal(auto.routeReady, false)
  assert.equal(auto.reviewStatus, 'auto-extracted')
  assert.equal(auto.source.kind, 'scraped')
  assert.equal(auto.source.name, '@sgfooddeals')
  assert.equal(auto.source.url, 'https://t.me/sgfooddeals/1')
  assert.equal(f.state.published.length, 0)
})

test('retired, expired-deal, expired-event and non-auto drafts are excluded', async () => {
  const pastEvent = autoDraft({ id: 'e-past', type: 'event', validity: null, startsAt: '2020-01-01T19:00:00+08:00', endsAt: '2020-01-01T21:00:00+08:00' })
  const f = fixture([
    autoDraft({ id: 'retired', status: 'retired' }),
    autoDraft({ id: 'old-deal', validity: { dateFrom: null, dateTo: '2020-01-01' } }),
    pastEvent,
    autoDraft({ id: 'manual', autoPublish: false, autoReason: 'Missing hours' }),
    autoDraft({ id: 'ended-gap', autoPublish: false, locationKnown: false, area: null, lat: null, lng: null, missing: ['dates', 'location'] }),
  ])
  const ids = (await f.api.listListings()).map(l => l.id)
  for (const id of ['pub-retired', 'pub-old-deal', 'pub-e-past', 'pub-manual', 'pub-ended-gap']) assert.ok(!ids.includes(id), id)
})

test('incomplete auto drafts stay listed and carry their gaps', async () => {
  const undated = autoDraft({
    id: 'undated', type: 'event', validity: null, startsAt: null, endsAt: null, missing: ['dates', 'times'], autoNote: 'No date in the post.',
  })
  const f = fixture([undated])
  const listing = (await f.api.listListings()).find(l => l.id === 'pub-undated')
  assert.ok(listing, 'incomplete listing present')
  assert.equal(listing.autoPublished, true)
  assert.equal(listing.routeReady, false)
  assert.deepEqual(listing.missing, ['dates', 'times'])
  assert.equal(listing.locationKnown, true)
  assert.equal(listing.autoNote, 'No date in the post.')
  assert.equal(listing.area, 'bugis')
  assert.equal(listing.lat, 1.3006)
})

test('a draft whose location is unknown has no area, coordinates or address, and is not placed on the map', async () => {
  const nowhere = autoDraft({
    id: 'nowhere', area: 'bugis', lat: 1.3006, lng: 103.8556, address: '1 Bugis St', locationKnown: false,
    missing: ['location'], autoNote: 'Venue could not be located.',
  })
  const f = fixture([nowhere])
  const listing = (await f.api.listListings()).find(l => l.id === 'pub-nowhere')
  assert.ok(listing, 'listing present without a location')
  assert.equal(listing.area, null)
  assert.equal(listing.lat, null)
  assert.equal(listing.lng, null)
  assert.equal(listing.address, null)
  assert.equal(listing.locationKnown, false)
  assert.deepEqual(listing.missing, ['location'])
  assert.equal(f.state.published.length, 0)
  // getListing resolves it too, and it still never becomes a stop.
  assert.equal((await f.api.getListing('pub-nowhere')).area, null)
})

test('an unrecognised area is treated as an unknown location even without the server flag', async () => {
  const f = fixture([autoDraft({ id: 'odd-area', area: 'atlantis', lat: null, lng: null, missing: [] })])
  const listing = (await f.api.listListings()).find(l => l.id === 'pub-odd-area')
  assert.ok(listing)
  assert.equal(listing.area, null)
  assert.equal(listing.locationKnown, false)
  assert.ok(listing.missing.includes('location'))
})

test('a failing drafts fetch does not break listListings', async () => {
  const f = fixture([autoDraft()])
  f.setFailing(true)
  const listings = await f.api.listListings()
  assert.ok(listings.length > 0)
  assert.ok(!listings.some(l => l.id === 'pub-a1'))
})

test('drafts are fetched at most once within the cache window', async () => {
  const f = fixture([autoDraft()])
  await f.api.listListings()
  await f.api.listListings()
  await f.api.getListing('pub-a1')
  assert.equal(f.fetches(), 1)
})

test('getListing finds an auto listing', async () => {
  const f = fixture([autoDraft()])
  const listing = await f.api.getListing('pub-a1')
  assert.equal(listing.autoPublished, true)
  assert.equal(listing.area, 'bugis')
  await assert.rejects(() => f.api.getListing('pub-missing'), e => e.code === 'not_found')
})

test('auto listings never become itinerary stops', async () => {
  const f = fixture([autoDraft()])
  const h = await f.api.createHangout({ title: 'Solo', area: 'bugis', mode: 'solo', mealWanted: false, slotStart: start, slotEnd: end })
  await f.api.generatePlan(h.id)
  const stopIds = f.state.itineraries[h.id].stops.map(stop => stop.listingId)
  assert.ok(stopIds.length > 0)
  assert.ok(!stopIds.includes('pub-a1'))
  await assert.rejects(() => f.api.setPlanStops(h.id, ['pub-a1']), e => e.code === 'not_found')
})

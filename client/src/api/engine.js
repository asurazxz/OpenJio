import { LISTINGS as DEFAULT_LISTINGS, AREAS, INTERESTS } from '../data/seed-listings.js'
import { rankSlots, earliestCommonSlot, heatmap, mergeIntervals, slotHeadline, rescueOptions } from '../lib/algo/slots.js'
import { generateItinerary, greedyItinerary, retime, alternativesFor } from '../lib/algo/itinerary.js'
import { joinSuggestions } from '../lib/algo/reachability.js'
import { isVerifiedDeal } from '../lib/algo/validity.js'
import { fromDateKey, toMs, toIso, sgDateKey, DAY, MIN } from '../lib/time.js'
import { assessSlot } from '../lib/slot-assessment.js'
import { customPlace } from '../lib/custom-place.js'
import { haversineKm } from '../lib/geo.js'
import { preparePublication, tidyTitle, tidyPrice } from '../lib/review.js'

// How long fetched pipeline drafts are reused before asking the server again.
const AUTO_DRAFTS_TTL_MS = 60 * 1000
// Live places are reused for 10 minutes; after a failed fetch the server is retried after 60 seconds.
const PLACES_TTL_MS = 10 * 60 * 1000
const PLACES_RETRY_MS = 60 * 1000
// Gaps the pipeline reports for an automatic listing.
const AUTO_MISSING = ['dates', 'times', 'location', 'source']
// One domain implementation for demo persistence and trusted hosted execution.
// Runtime dependencies own transport, identity, persistence and route lookup.
export function createApiEngine({
  load, persist, uid, token, getSessionUserId, setSessionUserId, resetDemo,
  reactive = value => value, travelFn, prefetchLegs, fetchDrafts,
  // Optional live places. placesStorage ({ read, write }) keeps the last good list for offline demo use.
  fetchPlaces, placesStorage,
  catalogue = DEFAULT_LISTINGS, latency = 90,
}) {
const LISTINGS = catalogue
const publicProfile = user => user ? { id: user.id, name: user.name, color: user.color } : null
// App data API. Every function is async and returns plain objects, so the demo store
// here can be replaced by a Supabase adapter with the same signatures.
// Permission checks live here, not in the views: hiding a button is not enough.



// Warnings that do not block confirming: shown honestly, but the host may accept them.
const SOFT_ISSUES = ['no_meal', 'unknown_hours']

const LATENCY = latency
const wait = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => JSON.parse(JSON.stringify(v))

class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/* ---------------- Session ---------------- */

const session = reactive({ userId: null })
session.userId = getSessionUserId()

function me() {
  const s = load()
  const user = s.users.find((u) => u.id === session.userId)
  if (!user) throw new ApiError('auth', 'Please sign in first.')
  return user
}

function currentUser() {
  const s = load()
  return s.users.find((u) => u.id === session.userId) || null
}

async function listUsers() {
  await wait(40)
  return clone(load().users)
}

async function signIn(userId) {
  await wait()
  const s = load()
  if (!s.users.some((u) => u.id === userId)) throw new ApiError('not_found', 'Unknown account.')
  session.userId = userId
  setSessionUserId(userId)
  return clone(currentUser())
}

function signOut() {
  session.userId = null
  setSessionUserId(null)
}

async function updateProfile(patch) {
  await wait()
  const user = me()
  if (!patch || typeof patch !== 'object') throw new ApiError('invalid', 'Nothing to update.')
  let homeArea = user.homeArea
  if (patch.homeArea !== undefined) {
    homeArea = patch.homeArea === null || patch.homeArea === '' ? null : patch.homeArea
    if (homeArea !== null && !AREAS.some((a) => a.slug === homeArea)) throw new ApiError('invalid', 'Choose a home area from the list.')
  }
  if (patch.name != null) user.name = String(patch.name).trim().slice(0, 40) || user.name
  user.homeArea = homeArea
  if (patch.interests) user.interests = sanitizeWeights(patch.interests)
  persist()
  return clone(user)
}

function sanitizeWeights(w) {
  if (typeof w !== 'object') return {}
  const out = {}
  for (const i of INTERESTS) {
    const v = Number(w[i.slug] || 0)
    if (v > 0) out[i.slug] = Math.min(1, Math.max(0, v))
  }
  return out
}

/* ---------------- Listings ---------------- */

function openJioListings(s) {
  return s.hangouts
    .filter((h) => h.visibility === 'public' && h.lockedSlot && (h.stage === 'voting' || h.stage === 'final'))
    .map((h) => {
      const host = s.users.find((u) => u.id === h.hostId)
      const count = s.members.filter((m) => m.hangoutId === h.id).length
      return {
        id: `oj-${h.id}`,
        hangoutId: h.id,
        type: 'hangout',
        kind: 'activity',
        title: h.title,
        summary: h.description || `Open Jio hosted by ${host?.name}.`,
        interests: h.interests,
        area: h.startArea.slug,
        address: h.startArea.label,
        lat: h.startArea.lat,
        lng: h.startArea.lng,
        startsAt: toIso(h.lockedSlot.start),
        endsAt: toIso(h.lockedSlot.end),
        durationMins: Math.round((h.lockedSlot.end - h.lockedSlot.start) / MIN),
        priceLevel: 0,
        priceText: 'Pay your own way',
        capacity: h.capacity,
        memberCount: count,
        hostName: host?.name,
        createdAt: h.createdAt,
        source: { kind: 'openjio', name: 'OpenJio host', retrievedAt: toIso(h.createdAt), verifiedAt: toIso(h.createdAt) },
      }
    })
}

/* Live places (OpenStreetMap). They live in memory, never in the shared state `s`. */
const placesState = { at: 0, places: [], retryAt: 0, pending: null }
const isPlace = (p) => Boolean(p) && typeof p.id === 'string' && p.id.length > 0

function storedPlaces() {
  try {
    const list = placesStorage?.read?.()
    return Array.isArray(list) ? list.filter(isPlace) : []
  } catch {
    return []
  }
}

async function refreshPlaces() {
  try {
    const list = await fetchPlaces()
    const seen = new Set()
    const places = Array.isArray(list) ? list.filter((p) => isPlace(p) && !seen.has(p.id) && seen.add(p.id)) : []
    placesState.places = places
    placesState.at = Date.now()
    placesState.retryAt = 0
    try { placesStorage?.write?.(places) } catch { /* keep the in-memory copy */ }
  } catch {
    // Keep serving the last list we had, or the saved one, so plans keep resolving.
    placesState.retryAt = Date.now() + PLACES_RETRY_MS
    if (!placesState.places.length) {
      const stored = storedPlaces()
      if (stored.length) placesState.places = stored
    }
  }
}

// Refreshes the live place list when it is stale. Never throws.
async function loadPlaces() {
  if (!fetchPlaces) return []
  const fresh = placesState.at && Date.now() - placesState.at < PLACES_TTL_MS
  if (!fresh && Date.now() >= placesState.retryAt) {
    placesState.pending ??= refreshPlaces().finally(() => { placesState.pending = null })
    await placesState.pending
  }
  return placesState.places
}

// Same name within this distance counts as the same venue listed by two sources.
const SAME_VENUE_KM = 0.5
const venueName = (title) => String(title ?? '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '')

// Sync read of the cached live places, minus any id or venue already curated or published,
// so one venue never appears (or gets scheduled) twice.
function livePlaces(s) {
  if (!placesState.places.length) return []
  const kept = [...LISTINGS, ...s.published]
  const taken = new Set(kept.map((l) => l.id))
  const byName = new Map()
  const claim = (l) => {
    const key = venueName(l.title)
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(l)
  }
  kept.forEach(claim)
  const out = []
  for (const p of placesState.places) {
    if (taken.has(p.id)) continue
    const twins = byName.get(venueName(p.title)) ?? []
    if (twins.some((l) => Number.isFinite(l.lat) && Number.isFinite(p.lat) && haversineKm(l, p) <= SAME_VENUE_KM)) continue
    claim(p)
    out.push(p)
  }
  return out
}

function allListings(s, auto = []) {
  return [...LISTINGS, ...s.published, ...livePlaces(s), ...auto, ...openJioListings(s)]
}

// Auto-published listings are derived at read time and never persisted. They are
// manual-view-only (routeReady false), so planning code never sees them.
let autoDraftCache = null
async function fetchAutoDrafts() {
  if (!fetchDrafts) return []
  if (autoDraftCache && Date.now() - autoDraftCache.at < AUTO_DRAFTS_TTL_MS) return autoDraftCache.drafts
  try {
    const drafts = await fetchDrafts()
    autoDraftCache = { at: Date.now(), drafts: Array.isArray(drafts) ? drafts : [] }
    return autoDraftCache.drafts
  } catch {
    // Drafts are optional for the public listing: failing here must not fail the call.
    return []
  }
}

// The listing for one auto-publishable draft, or null when it must not be shown.
function autoListingFor(draft, s, now) {
  if (!draft || draft.autoPublish !== true || draft.status === 'retired') return null
  // Incomplete drafts stay listed with their gaps. Without a known area there is no location at all.
  const located = draft.locationKnown !== false && AREAS.some((a) => a.slug === draft.area)
  const missing = (Array.isArray(draft.missing) ? draft.missing : []).filter((m) => AUTO_MISSING.includes(m))
  if (!located && !missing.includes('location')) missing.push('location')
  let listing
  try {
    const place = located ? draft : { ...draft, area: null, lat: null, lng: null, address: null }
    listing = preparePublication({ ...place, routeReady: false }, AREAS, draft.autoCheckedAt, { allowUnlocated: true })
  } catch {
    return null
  }
  if (listing.type === 'event' && listing.endsAt && Date.parse(listing.endsAt) < now) return null
  if (listing.type === 'deal' && listing.validity?.dateTo && listing.validity.dateTo < sgDateKey(now)) return null
  return {
    ...listing, title: tidyTitle(listing.title), priceText: tidyPrice(listing.priceText),
    reviewStatus: 'auto-extracted', autoPublished: true,
    locationKnown: located, missing, autoNote: typeof draft.autoNote === 'string' ? draft.autoNote : null,
  }
}

function autoListings(drafts, s, now = Date.now()) {
  const taken = new Set([...LISTINGS, ...s.published].map((l) => l.id))
  const out = []
  for (const draft of drafts) {
    const listing = autoListingFor(draft, s, now)
    if (!listing || taken.has(listing.id)) continue
    taken.add(listing.id)
    out.push(listing)
  }
  return out
}

/** Listings usable as itinerary stops (not Open Jios, not drafts). */
function stopCandidates(s) {
  return [...LISTINGS, ...s.published, ...livePlaces(s)].filter((l) => l.status !== 'draft' && l.routeReady !== false)
}

function findListing(s, id) {
  // Plans saved before a live place was recognised as a duplicate still resolve it by id.
  return allListings(s).find((l) => l.id === id) || placesState.places.find((p) => p.id === id) || null
}

function findPlanListing(s, h, id) {
  return findListing(s, id) || s.itineraries[h.id]?.customPlaces?.find(place => place.id === id) || null
}

async function listListings() {
  await wait()
  const [drafts] = await Promise.all([fetchAutoDrafts(), loadPlaces()])
  const s = load()
  return clone(allListings(s, autoListings(drafts, s)))
}

async function getListing(id) {
  await wait(40)
  await loadPlaces()
  const s = load()
  const l = findListing(s, id) || autoListings(await fetchAutoDrafts(), load()).find((x) => x.id === id) || null
  if (!l) throw new ApiError('not_found', 'That listing is no longer available.')
  return clone(l)
}

/* ---------------- Hangouts ---------------- */

function hangoutOrThrow(s, id) {
  const h = s.hangouts.find((x) => x.id === id)
  if (!h) throw new ApiError('not_found', 'This hangout does not exist or was removed.')
  return h
}

function membership(s, hangoutId, userId) {
  return s.members.find((m) => m.hangoutId === hangoutId && m.userId === userId) || null
}

function requireMember(s, h, user) {
  const m = membership(s, h.id, user.id)
  if (!m) throw new ApiError('forbidden', 'Only members can see this hangout.')
  return m
}

function requireHost(s, h, user) {
  const m = requireMember(s, h, user)
  if (m.role !== 'host') throw new ApiError('forbidden', 'Only the host can do that.')
  requireActive(h)
  return m
}

function requireActive(h) {
  if (h.stage === 'ended' || h.stage === 'cancelled') throw new ApiError('closed', 'This hangout is over.')
}

function touch(h) {
  h.updatedAt = Date.now()
}

function summary(s, h, userId) {
  const members = s.members.filter((m) => m.hangoutId === h.id)
  const mine = members.find((m) => m.userId === userId)
  return {
    ...clone(h),
    memberCount: members.length,
    respondedCount: members.filter((m) => m.respondedAt).length,
    myRole: mine?.role || null,
    iResponded: Boolean(mine?.respondedAt),
    host: publicProfile(s.users.find((u) => u.id === h.hostId)),
    stopCount: s.itineraries[h.id]?.stops.length || 0,
  }
}

async function listMyHangouts() {
  await wait()
  const user = me()
  const s = load()
  const ids = new Set(s.members.filter((m) => m.userId === user.id).map((m) => m.hangoutId))
  return s.hangouts
    .filter((h) => ids.has(h.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((h) => summary(s, h, user.id))
}

// A custom start point must be a real Singapore coordinate with a short label.
const SINGAPORE = { minLat: 1.13, maxLat: 1.48, minLng: 103.58, maxLng: 104.10 }
function customStartArea(value) {
  if (!value || typeof value !== 'object') return null
  const lat = Number(value.lat), lng = Number(value.lng)
  const label = typeof value.label === 'string' ? value.label.trim().slice(0, 80) : ''
  if (value.lat == null || value.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < SINGAPORE.minLat || lat > SINGAPORE.maxLat || lng < SINGAPORE.minLng || lng > SINGAPORE.maxLng) {
    throw new ApiError('invalid', 'The start point must be in Singapore.')
  }
  if (!label) throw new ApiError('invalid', 'Name the start point.')
  return { slug: 'custom', label, lat, lng }
}

async function createHangout(input) {
  await wait()
  const user = me()
  const s = load()
  if (!input || typeof input !== 'object') throw new ApiError('invalid', 'Fill in the hangout details.')
  const title = String(input.title || '').trim()
  if (!title) throw new ApiError('invalid', 'Give the hangout a name.')
  const area = AREAS.find((a) => a.slug === input.area) || customStartArea(input.startArea)
  if (!area) throw new ApiError('invalid', 'Choose a start area.')
  const mode = input.mode === 'solo' ? 'solo' : 'group'
  const visibility = mode === 'group' && input.visibility === 'public' ? 'public' : 'private'
  const fixedSlot = mode === 'solo' || visibility === 'public'
  let lockedSlot = null
  if (fixedSlot) {
    const start = toMs(input.slotStart)
    const end = toMs(input.slotEnd)
    if (!start || !end || end - start < 60 * MIN) throw new ApiError('invalid', 'Pick a time at least an hour long.')
    if (end - start > 12 * 60 * MIN) throw new ApiError('invalid', 'Keep it under 12 hours.')
    lockedSlot = { start, end }
  } else {
    if (!input.dateFrom || !input.dateTo || input.dateTo < input.dateFrom) throw new ApiError('invalid', 'Choose a valid date range.')
    if ((fromDateKey(input.dateTo) - fromDateKey(input.dateFrom)) / DAY > 6) throw new ApiError('invalid', 'Keep the range to 7 days or fewer.')
  }
  const capacity = visibility === 'public' ? Math.min(8, Math.max(2, Number(input.capacity) || 6)) : null
  const h = {
    id: uid('h'),
    hostId: user.id,
    title: title.slice(0, 60),
    description: String(input.description || '').trim().slice(0, 200) || null,
    mode,
    visibility,
    capacity,
    inviteToken: token(),
    stage: fixedSlot ? 'voting' : 'collecting',
    dateFrom: fixedSlot ? null : input.dateFrom,
    dateTo: fixedSlot ? null : input.dateTo,
    startArea: { slug: area.slug || 'custom', label: area.label, lat: area.lat, lng: area.lng },
    interests: Array.isArray(input.interests) ? [...new Set(input.interests)].filter((slug) => INTERESTS.some((i) => i.slug === slug)).slice(0, 5) : [],
    mealWanted: input.mealWanted !== false,
    lockedSlot,
    shortlist: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    planChangedAt: null,
  }
  s.hangouts.push(h)
  s.members.push({ hangoutId: h.id, userId: user.id, role: 'host', required: true, respondedAt: fixedSlot ? Date.now() : null, joinedAt: Date.now() })
  s.availability[h.id] = {}
  s.prefs[h.id] = {}
  persist()
  return clone(h)
}

/** Correct host-owned details without bypassing stage or agreement rules. */
async function updateHangout(id, patch) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const next = { ...h }
  if (patch.title !== undefined) {
    const title = String(patch.title).trim()
    if (!title) throw new ApiError('invalid', 'Give the hangout a name.')
    next.title = title.slice(0, 60)
  }
  if (patch.description !== undefined) next.description = String(patch.description).trim().slice(0, 200) || null
  // An exact place to meet ("Bugis MRT, exit C"), shown to members only; it does not change the plan.
  if (patch.meetingPoint !== undefined) next.meetingPoint = String(patch.meetingPoint ?? '').trim().slice(0, 120) || null
  if (patch.area !== undefined) {
    const area = AREAS.find((a) => a.slug === patch.area)
    if (!area) throw new ApiError('invalid', 'Choose a start area.')
    next.startArea = { ...area }
  }
  if (h.visibility === 'public' && patch.capacity !== undefined) {
    const count = s.members.filter((m) => m.hangoutId === id).length
    if (!Number.isInteger(Number(patch.capacity)) || Number(patch.capacity) < Math.max(2, count) || Number(patch.capacity) > 8) throw new ApiError('invalid', `Capacity must be between ${Math.max(2, count)} and 8.`)
    next.capacity = Number(patch.capacity)
  }
  let datesChanged = false
  if (patch.dateFrom !== undefined || patch.dateTo !== undefined) {
    if (h.lockedSlot || h.mode === 'solo' || h.visibility === 'public') throw new ApiError('invalid', 'Change the locked time instead of the availability dates.')
    next.dateFrom = patch.dateFrom ?? h.dateFrom
    next.dateTo = patch.dateTo ?? h.dateTo
    const from = fromDateKey(next.dateFrom), to = fromDateKey(next.dateTo)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(next.dateTo) || !Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 6 * DAY) throw new ApiError('invalid', 'Choose a valid range of up to 7 days.')
    datesChanged = next.dateFrom !== h.dateFrom || next.dateTo !== h.dateTo
  }
  if (patch.slotStart !== undefined || patch.slotEnd !== undefined) {
    if (h.mode !== 'solo' && h.visibility !== 'public') throw new ApiError('invalid', 'Use the group availability step to choose a time.')
    const start = toMs(patch.slotStart ?? h.lockedSlot?.start), end = toMs(patch.slotEnd ?? h.lockedSlot?.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 60 * MIN || end - start > 12 * 60 * MIN) throw new ApiError('invalid', 'Choose a time between 1 and 12 hours long.')
    next.lockedSlot = { start, end }
  }
  const changesPlan = next.startArea.slug !== h.startArea.slug || next.lockedSlot?.start !== h.lockedSlot?.start || next.lockedSlot?.end !== h.lockedSlot?.end
  Object.assign(h, next)
  if (datesChanged) {
    s.availability[id] = {}
    for (const member of s.members.filter((m) => m.hangoutId === id)) member.respondedAt = null
  }
  const plan = s.itineraries[id]
  if (changesPlan && plan?.stops.length) {
    for (const stop of plan.stops) { stop.version++; delete stop.scheduledStart; delete stop.scheduledEnd }
    plan.acceptedRoutes = []
    plan.finalizedAt = null
    h.planChangedAt = Date.now()
    if (h.stage === 'final') h.stage = 'voting'
  }
  touch(h)
  persist()
  return clone(h)
}

/** Full hangout view for a member. Other members' raw availability is never returned. */
async function getHangout(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const mine = requireMember(s, h, user)
  const members = s.members
    .filter((m) => m.hangoutId === id)
    .map((m) => ({ ...clone(m), user: publicProfile(s.users.find((u) => u.id === m.userId)) }))
    .sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.joinedAt - b.joinedAt))
  return {
    hangout: summary(s, h, user.id),
    members,
    me: clone(mine),
    myAvailability: clone(s.availability[id]?.[user.id] || []),
    myPrefs: clone(s.prefs[id]?.[user.id] || null),
  }
}

/** Public preview for an invite link or Open Jio: no member details beyond names. */
async function previewHangout({ token: t, id }) {
  await wait()
  const s = load()
  const h = t ? s.hangouts.find((x) => x.inviteToken === t) : s.hangouts.find((x) => x.id === id && x.visibility === 'public')
  if (!h) throw new ApiError('not_found', 'This invite link is not valid any more.')
  const members = s.members.filter((m) => m.hangoutId === h.id)
  // Planned stops, so someone deciding whether to join can see what the outing is. Names, times and
  // public places only; votes and member details stay private. Times come from the saved schedule,
  // or are worked out read-only when no member has opened the plan since it changed.
  await loadPlaces()
  const planned = s.itineraries[h.id]?.stops || []
  const listings = planned.map((st) => findPlanListing(s, h, st.listingId))
  let stops = []
  if (h.lockedSlot && listings.length && listings.every(Boolean)) {
    const saved = planned.every((st) => st.scheduledStart != null)
    const times = saved ? planned.map((st) => ({ start: st.scheduledStart, end: st.scheduledEnd })) : retime(listings, planInput(s, h)).stops
    stops = listings.map((l, i) => ({ title: l.title, type: l.type, kind: l.kind, start: times[i].start, end: times[i].end, lat: l.lat ?? null, lng: l.lng ?? null }))
  }
  return {
    id: h.id,
    title: h.title,
    description: h.description,
    stops,
    visibility: h.visibility,
    stage: h.stage,
    startArea: h.startArea,
    lockedSlot: h.lockedSlot,
    dateFrom: h.dateFrom,
    dateTo: h.dateTo,
    capacity: h.capacity,
    interests: h.interests,
    memberCount: members.length,
    host: s.users.find((u) => u.id === h.hostId)?.name,
    memberNames: members.map((m) => s.users.find((u) => u.id === m.userId)?.name.split(' ')[0]),
    alreadyMember: session.userId ? members.some((m) => m.userId === session.userId) : false,
  }
}

async function joinHangout({ token: t, id }) {
  await wait()
  const user = me()
  const s = load()
  const h = t ? s.hangouts.find((x) => x.inviteToken === t) : s.hangouts.find((x) => x.id === id && x.visibility === 'public')
  if (!h) throw new ApiError('not_found', 'This invite link is not valid any more.')
  if (h.stage === 'ended' || h.stage === 'cancelled') throw new ApiError('closed', 'This hangout is over.')
  if (h.mode === 'solo') throw new ApiError('closed', 'This is a solo plan.')
  if (membership(s, h.id, user.id)) return { id: h.id, already: true }
  const count = s.members.filter((m) => m.hangoutId === h.id).length
  const cap = h.capacity || 8
  if (count >= cap) throw new ApiError('full', 'This hangout is full.')
  s.members.push({ hangoutId: h.id, userId: user.id, role: 'member', required: false, respondedAt: h.lockedSlot ? Date.now() : null, joinedAt: Date.now() })
  touch(h)
  persist()
  return { id: h.id, already: false }
}

async function leaveHangout(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
  requireActive(h)
  if (m.role === 'host') throw new ApiError('forbidden', 'The host cannot leave. Cancel the hangout instead.')
  s.members = s.members.filter((x) => x !== m)
  delete s.availability[id]?.[user.id]
  delete s.prefs[id]?.[user.id]
  for (const stop of s.itineraries[id]?.stops || []) delete s.votes[stop.id]?.[user.id]
  touch(h)
  persist()
}

async function setRequired(id, userId, required) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const m = membership(s, id, userId)
  if (!m) throw new ApiError('not_found', 'Not a member.')
  if (m.role === 'host') return
  m.required = Boolean(required)
  touch(h)
  persist()
}

async function setStage(id, stage) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!['ended', 'cancelled'].includes(stage)) throw new ApiError('invalid', 'Use the plan actions for other stages.')
  h.stage = stage
  touch(h)
  persist()
}

async function renewInvite(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  h.inviteToken = token()
  touch(h)
  persist()
  return h.inviteToken
}

/* ---------------- Availability and slots ---------------- */

async function saveAvailability(id, intervals, source = 'grid') {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
  requireActive(h)
  if (h.lockedSlot && h.stage !== 'collecting') throw new ApiError('closed', 'The time is already locked.')
  const lo = fromDateKey(h.dateFrom)
  const hi = fromDateKey(h.dateTo) + DAY
  const clean = mergeIntervals(
    intervals.map((i) => ({ start: Math.max(lo, toMs(i.start)), end: Math.min(hi, toMs(i.end)) })).filter((i) => i.end > i.start),
  ).map((i) => ({ ...i, source }))
  s.availability[id] = s.availability[id] || {}
  s.availability[id][user.id] = clean
  m.respondedAt = Date.now()
  touch(h)
  persist()
  return clone(clean)
}

async function clearAvailability(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
  requireActive(h)
  if (h.lockedSlot && h.stage !== 'collecting') throw new ApiError('closed', 'The time is already locked.')
  if (s.availability[id]) delete s.availability[id][user.id]
  m.respondedAt = null
  touch(h)
  persist()
}

async function savePreferences(id, weights) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  requireActive(h)
  s.prefs[id] = s.prefs[id] || {}
  s.prefs[id][user.id] = sanitizeWeights(weights)
  touch(h)
  persist()
}

/** Ranked slots and an aggregate heatmap. Raw per-person intervals stay inside this function. */
async function getSlots(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const members = s.members
    .filter((m) => m.hangoutId === id)
    .map((m) => ({ id: m.userId, required: m.required, responded: Boolean(m.respondedAt), host: m.role === 'host' }))
  const availability = s.availability[id] || {}
  const rangeStart = fromDateKey(h.dateFrom)
  const rangeEnd = fromDateKey(h.dateTo) + DAY
  const ranked = rankSlots({ members, availability, rangeStart, rangeEnd })
  const baseline = earliestCommonSlot({ members, availability, rangeStart, rangeEnd })
  const days = []
  for (let t = rangeStart; t < rangeEnd; t += DAY) days.push(t)
  const responded = members.filter((m) => m.responded).map((m) => m.id)
  const grid = heatmap(availability, responded, days, 8 * 60, 24 * 60).map((d) => ({
    day: d.day,
    cells: d.cells.map((c) => ({ start: c.start, count: c.count })),
  }))
  const names = Object.fromEntries(s.users.map((u) => [u.id, u.name.split(' ')[0]]))
  const name = (ids) => ids.map((x) => names[x] || 'Someone')
  const requiredIds = new Set(members.filter((m) => m.required).map((m) => m.id))
  const unknownIds = new Set(ranked.unknown)
  // Each best-time card leads with the decision facts in plain words; required people who cannot come are named as such.
  const withHeadline = (sl) => slotHeadline({
    start: sl.start,
    end: sl.end,
    free: name(sl.attendees),
    cant: sl.missing.filter((x) => !unknownIds.has(x)).map((x) => (names[x] || 'Someone') + (requiredIds.has(x) ? ' (required)' : '')),
    pending: name(sl.missing.filter((x) => unknownIds.has(x))),
  })
  // When no time works, offer options the host can choose from. Nothing is applied automatically.
  let rescue = null
  if (!ranked.slots.length) {
    const r = rescueOptions({ members, availability, rangeStart, rangeEnd })
    rescue = {
      state: r.state,
      waiting: name(r.waiting),
      options: r.options.map((o) => ({
        id: o.id, kind: o.kind, userId: o.personId, name: o.personId ? names[o.personId] || 'Someone' : null,
        start: o.start, end: o.end, minutes: o.minutes,
        attendeeNames: name(o.attendees), missingNames: name(o.missing),
      })),
    }
  }
  return {
    rescue,
    slots: ranked.slots.map((sl) => ({ ...sl, attendeeNames: name(sl.attendees), missingNames: name(sl.missing), headline: withHeadline(sl) })),
    missingRequired: name(ranked.missingRequired),
    unknown: name(ranked.unknown),
    baseline,
    heatmap: grid,
    responded: responded.length,
    total: members.length,
  }
}

function slotAssessment(s, h, slot, minimumMins) {
  const members = s.members.filter(m => m.hangoutId === h.id).map(m => ({ id: m.userId, required: m.required, responded: Boolean(m.respondedAt) }))
  return assessSlot({ slot, members, availability: s.availability[h.id] || {}, rangeStart: fromDateKey(h.dateFrom), rangeEnd: fromDateKey(h.dateTo) + DAY, ...(minimumMins ? { minimumMins } : {}) })
}

async function previewSlot(id, slot) {
  await wait(40)
  const user = me(), s = load(), h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const result = slotAssessment(s, h, slot)
  const names = ids => ids.map(id => s.users.find(u => u.id === id)?.name.split(' ')[0] || 'Someone')
  return { ok: result.ok, errors: result.errors, attendeeNames: names(result.attendees), missingNames: names(result.missing), unknown: names(result.unknown), missingRequired: names(result.missingRequired) }
}

// `short` is the host's explicit choice of a time under the usual 2 hours (never under 1 hour), offered when nothing longer works.
async function lockSlot(id, slot, { short = false } = {}) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!slot?.start || !slot?.end || slot.end <= slot.start) throw new ApiError('invalid', 'Choose a slot first.')
  if (h.mode !== 'solo' && h.visibility !== 'public') {
    const result = slotAssessment(s, h, slot, short ? 60 : undefined)
    if (!result.ok) throw new ApiError('invalid', result.errors.join(' '))
  }
  const hadPlan = s.itineraries[id]?.stops.length > 0
  if (hadPlan && (h.lockedSlot?.start !== slot.start || h.lockedSlot?.end !== slot.end)) {
    for (const stop of s.itineraries[id].stops) stop.version++
  }
  h.lockedSlot = { start: slot.start, end: slot.end }
  h.stage = 'voting'
  if (hadPlan) {
    h.planChangedAt = Date.now()
    if (s.itineraries[id]) s.itineraries[id].finalizedAt = null
  }
  touch(h)
  persist()
}

async function unlockSlot(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (h.visibility === 'public' || h.mode === 'solo') throw new ApiError('invalid', 'This hangout has a fixed time.')
  h.lockedSlot = null
  h.stage = 'collecting'
  if (s.itineraries[id]) s.itineraries[id].finalizedAt = null
  touch(h)
  persist()
}

/* ---------------- Plans ---------------- */

function planMembers(s, h) {
  return s.members
    .filter((m) => m.hangoutId === h.id)
    .filter((m) => h.mode === 'solo' || h.visibility === 'public' || (m.respondedAt && mergeIntervals(s.availability[h.id]?.[m.userId] || []).some((iv) => iv.start <= h.lockedSlot.start && iv.end >= h.lockedSlot.end)))
    .map((m) => {
      const base = s.users.find((u) => u.id === m.userId)?.interests || {}
      const hp = s.prefs[h.id]?.[m.userId]
      // Hangout-specific preferences override the profile; the host's vibe tags add a little to everyone.
      const interests = { ...base, ...(hp || {}) }
      for (const tag of h.interests || []) interests[tag] = Math.max(interests[tag] || 0, 0.4)
      return { id: m.userId, interests }
    })
}

function planInput(s, h, extra = {}) {
  const currentTravel = travelFn(h.lockedSlot.start)
  const accepted = s.itineraries[h.id]?.acceptedRoutes || []
  return {
    slot: h.lockedSlot,
    start: h.startArea,
    candidates: stopCandidates(s),
    members: planMembers(s, h),
    travel: (from, to, departMs = h.lockedSlot.start) => {
      const current = currentTravel(from, to, departMs)
      if (!current.estimate) return current
      const saved = accepted.find((leg) => leg.departMs === departMs && leg.fromLat === from.lat && leg.fromLng === from.lng && leg.toLat === to.lat && leg.toLng === to.lng)
      return saved ? { mins: saved.mins, mode: saved.mode, estimate: false } : current
    },
    options: { mealWanted: h.mealWanted, ...extra },
  }
}

// One plain sentence on why a stop is in the plan, from data the planner actually used.
function stopReason(listing, members, names, solo) {
  const tags = listing.interests || []
  const fans = members.filter((m) => tags.some((t) => (m.interests[t] || 0) >= 0.6)).map((m) => names[m.id] || 'Someone')
  const list = (xs) => (xs.length > 3 ? `${xs.slice(0, 3).join(', ')} and others` : xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0])
  const parts = []
  if (listing.kind === 'meal') parts.push('Covers the meal in this time window')
  if (fans.length && solo) parts.push('Matches your interests')
  else if (fans.length === members.length && members.length > 1) parts.push('Everyone is into this kind of thing')
  else if (fans.length) parts.push(`${list(fans)} ${fans.length === 1 ? 'likes' : 'like'} this kind of thing`)
  if (isVerifiedDeal(listing)) parts.push('Has a source-checked deal')
  if (listing.type === 'event') parts.push('Only on at this time')
  return parts.length ? parts.join('. ') + '.' : 'Fits the time and keeps travel short.'
}

function tally(s, stop, memberIds) {
  const votes = Object.entries(s.votes[stop.id] || {}).filter(([id, v]) => memberIds.includes(id) && v.version === stop.version).map(([, v]) => v)
  const up = votes.filter((v) => v.value > 0).length
  const down = votes.filter((v) => v.value < 0).length
  return { up, down, voted: votes.length, of: memberIds.length, net: up - down }
}

/** Plan with timings recomputed from the slot, validation issues and vote tallies. */
async function getPlan(id) {
  await wait()
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const plan = s.itineraries[id]
  if (!h.lockedSlot) return { hangoutId: id, stops: [], issues: [], needsSlot: true }
  if (!plan || !plan.stops.length) return { hangoutId: id, stops: [], issues: [], empty: true, shortlist: clone(h.shortlist.map((x) => findListing(s, x)).filter(Boolean)) }
  const listings = plan.stops.map((st) => findPlanListing(s, h, st.listingId))
  const missing = listings.findIndex((l) => !l)
  if (missing !== -1) {
    return { hangoutId: id, stops: [], issues: [{ index: missing, type: 'missing', message: 'A stop was removed from the listings. Regenerate or rebuild the plan.' }], broken: true }
  }
  const input = planInput(s, h)
  const r = retime(listings, input)
  // Viewing is read-only for an ended or cancelled hangout: closed plans keep
  // their saved timings, and the hosted commit would refuse the write.
  const closed = h.stage === 'ended' || h.stage === 'cancelled'
  if (!closed && syncStopTimings(plan, r.stops, h)) {
    rememberRoutes(plan, r.stops, h)
    persist()
  }
  const memberIds = s.members.filter((m) => m.hangoutId === id).map((m) => m.userId)
  const names = Object.fromEntries(s.users.map((u) => [u.id, u.name.split(' ')[0]]))
  return {
    hangoutId: id,
    generatedBy: plan.generatedBy,
    method: plan.method,
    finalizedAt: plan.finalizedAt,
    score: r.score,
    reasons: r.reasons,
    issues: r.issues,
    ok: r.ok,
    stops: r.stops.map((st, i) => ({
      ...clone(st),
      id: plan.stops[i].id,
      version: plan.stops[i].version,
      why: stopReason(st.listing, input.members, names, h.mode === 'solo'),
      votes: tally(s, plan.stops[i], memberIds),
      myVote: (() => {
        const v = s.votes[plan.stops[i].id]?.[user.id]
        return v && v.version === plan.stops[i].version ? v.value : 0
      })(),
    })),
    shortlist: clone(h.shortlist.map((x) => findListing(s, x)).filter(Boolean)),
  }
}

function syncStopTimings(plan, scheduled, h) {
  let changed = false
  plan.stops.forEach((stop, i) => {
    const next = scheduled[i]
    if (stop.scheduledStart != null && (stop.scheduledStart !== next.start || stop.scheduledEnd !== next.end)) {
      stop.version++
      plan.finalizedAt = null
      if (h.stage === 'final') h.stage = 'voting'
      h.planChangedAt = Date.now()
      changed = true
    }
    if (stop.scheduledStart !== next.start || stop.scheduledEnd !== next.end) changed = true
    stop.scheduledStart = next.start
    stop.scheduledEnd = next.end
  })
  return changed
}

function rememberRoutes(plan, scheduled, h) {
  let from = h.startArea
  let departMs = h.lockedSlot.start
  plan.acceptedRoutes = scheduled.flatMap((stop) => {
    const leg = stop.travelEstimate ? [] : [{ fromLat: from.lat, fromLng: from.lng, toLat: stop.listing.lat, toLng: stop.listing.lng, departMs, mins: stop.travelMins, mode: stop.travelMode }]
    from = stop.listing
    departMs = stop.end
    return leg
  })
}

function writeStops(s, h, listingIds, generatedBy, method) {
  const prev = s.itineraries[h.id]?.stops || []
  const previousListings = prev.map((st) => findPlanListing(s, h, st.listingId))
  if (previousListings.length && previousListings.every(Boolean)) {
    syncStopTimings(s.itineraries[h.id], retime(previousListings, planInput(s, h)).stops, h)
  }
  const stops = listingIds.map((listingId, i) => {
    const old = prev[i]
    if (old && old.listingId === listingId) return old
    // A changed stop gets a new version so earlier votes on that position stop counting.
    return { id: old?.id || uid('st'), listingId, version: (old?.version || 0) + 1 }
  })
  const wasFinal = h.stage === 'final'
  s.itineraries[h.id] = {
    ...(s.itineraries[h.id] || {}),
    generatedBy,
    method,
    stops,
    finalizedAt: null,
    createdAt: s.itineraries[h.id]?.createdAt || Date.now(),
  }
  const scheduled = retime(listingIds.map((id) => findPlanListing(s, h, id)), planInput(s, h)).stops
  syncStopTimings(s.itineraries[h.id], scheduled, h)
  rememberRoutes(s.itineraries[h.id], scheduled, h)
  if (s.itineraries[h.id].customPlaces) s.itineraries[h.id].customPlaces = s.itineraries[h.id].customPlaces.filter(place => listingIds.includes(place.id))
  if (wasFinal || s.itineraries[h.id].everFinal) {
    h.planChangedAt = Date.now()
    s.itineraries[h.id].everFinal = true
  }
  if (h.stage === 'final') h.stage = 'voting'
  touch(h)
}

async function generatePlan(id, { method = 'beam', relax = null } = {}) {
  await wait(160)
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!h.lockedSlot) throw new ApiError('invalid', 'Lock a time slot before generating a plan.')
  const extra = {}
  if (relax === 'fewer_stops') extra.minStops = 1
  if (relax === 'no_meal') extra.mealWanted = false
  if (relax === 'widen_area') extra.radiusKm = 12
  const input = planInput(s, h, extra)
  const result = method === 'greedy' ? greedyItinerary(input) : generateItinerary(input)
  if (!result.ok) return { ok: false, problems: result.problems }
  // Refine with live routes when available, then re-check timings.
  const listings = result.stops.map((st) => st.listing)
  let departMs = h.lockedSlot.start
  for (let i = 0; i < listings.length; i++) {
    await prefetchLegs([i === 0 ? h.startArea : listings[i - 1], listings[i]], departMs)
    requireActive(h)
    const prefix = retime(listings.slice(0, i + 1), planInput(s, h, extra))
    departMs = prefix.stops[i].end
  }
  requireActive(h)
  const refined = retime(listings, planInput(s, h, extra))
  if (!refined.ok) {
    return { ok: false, problems: refined.issues.map((i) => ({ cause: i.message, relax: 'change_slot', label: 'Pick a different slot' })) }
  }
  writeStops(s, h, result.stops.map((st) => st.listingId), 'auto', method)
  if (relax === 'no_meal') h.mealWanted = false
  persist()
  return { ok: true }
}

async function setPlanStops(id, listingIds) {
  await wait()
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!h.lockedSlot) throw new ApiError('invalid', 'Lock a time slot first.')
  if (listingIds.length > 6) throw new ApiError('invalid', 'Keep it to 6 stops or fewer.')
  for (const lid of listingIds) {
    const listing = findPlanListing(s, h, lid)
    if (!listing) throw new ApiError('not_found', 'One of those places is not available.')
    if (listing.routeReady === false) throw new ApiError('invalid', 'This listing still needs verified visit details before it can be planned.')
  }
  writeStops(s, h, listingIds, 'manual', s.itineraries[id]?.method || 'manual')
  persist()
}

function proposedPlace(s, h, data, id) {
  if (!h.lockedSlot) throw new ApiError('invalid', 'Lock a time slot first.')
  if ((s.itineraries[h.id]?.stops.length || 0) >= 6) throw new ApiError('invalid', 'Keep it to 6 stops or fewer.')
  const place = customPlace(data, { id, slot: h.lockedSlot, area: h.startArea.slug })
  if ((s.itineraries[h.id]?.customPlaces || []).filter(p => s.itineraries[h.id].stops.some(stop => stop.listingId === p.id)).some(p =>
    (place.providerId && p.providerId === place.providerId) || (p.title.toLowerCase() === place.title.toLowerCase() && p.lat === place.lat && p.lng === place.lng))) {
    throw new ApiError('invalid', 'That place is already in this outing.')
  }
  return place
}

async function previewCustomStop(id, data) {
  await wait(40)
  await loadPlaces()
  const user = me(), s = load(), h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const place = proposedPlace(s, h, data, 'custom-preview')
  const current = (s.itineraries[id]?.stops || []).map(st => findPlanListing(s, h, st.listingId))
  if (current.some(p => !p)) throw new ApiError('not_found', 'A stop is no longer available. Rebuild the plan first.')
  return clone(retime([...current, place], planInput(s, h)))
}

async function addCustomStop(id, data) {
  await wait()
  await loadPlaces()
  const user = me(), s = load(), h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const place = proposedPlace(s, h, data, uid('custom'))
  const previous = s.itineraries[id]
  const next = [...(previous?.stops || []).map(st => st.listingId), place.id]
  // Prepare on a temporary snapshot: a failed computation must not leave a place behind.
  const staged = { ...s, itineraries: { ...s.itineraries, [id]: { ...(previous || {}), stops: previous?.stops || [], customPlaces: [...(previous?.customPlaces || []), place] } } }
  writeStops(staged, h, next, 'manual', previous?.method || 'manual')
  s.itineraries[id] = staged.itineraries[id]
  persist()
  return clone(place)
}

async function getAlternatives(id, index) {
  await wait()
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const plan = s.itineraries[id]
  const listings = plan.stops.map((st) => findPlanListing(s, h, st.listingId))
  return clone(alternativesFor(listings, index, planInput(s, h), 3))
}

/** Preview a sequence without saving: used for "check before replacing". */
async function previewStops(id, listingIds) {
  await wait(40)
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const listings = listingIds.map((x) => findPlanListing(s, h, x)).filter(Boolean)
  return clone(retime(listings, planInput(s, h)))
}

async function vote(id, stopId, value) {
  await wait(60)
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  if (h.stage !== 'voting') throw new ApiError('closed', 'Voting is closed.')
  const stop = s.itineraries[id]?.stops.find((x) => x.id === stopId)
  if (!stop) throw new ApiError('not_found', 'That stop changed. Refresh to see the latest plan.')
  s.votes[stopId] = s.votes[stopId] || {}
  if (!value) delete s.votes[stopId][user.id]
  else s.votes[stopId][user.id] = { value: value > 0 ? 1 : -1, version: stop.version, at: Date.now() }
  touch(h)
  persist()
}

async function finalizePlan(id) {
  await wait()
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const plan = s.itineraries[id]
  if (!plan?.stops.length) throw new ApiError('invalid', 'Add at least one stop first.')
  const listings = plan.stops.map((st) => findPlanListing(s, h, st.listingId))
  if (listings.some((l) => !l)) throw new ApiError('invalid', 'A stop is no longer available.')
  const r = retime(listings, planInput(s, h))
  const blocking = r.issues.filter((i) => !SOFT_ISSUES.includes(i.type))
  if (blocking.length) throw new ApiError('invalid', 'Fix these first: ' + blocking.map((i) => i.message).join('; '))
  syncStopTimings(plan, r.stops, h)
  rememberRoutes(plan, r.stops, h)
  plan.finalizedAt = Date.now()
  plan.everFinal = true
  h.stage = 'final'
  h.planChangedAt = null
  touch(h)
  persist()
}

async function reopenVoting(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (h.stage !== 'final') return
  h.stage = 'voting'
  h.planChangedAt = Date.now()
  if (s.itineraries[id]) s.itineraries[id].finalizedAt = null
  touch(h)
  persist()
}

async function addToShortlist(id, listingId) {
  await wait()
  await loadPlaces()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  requireActive(h)
  if (!findListing(s, listingId)) throw new ApiError('not_found', 'That listing is not available.')
  if (!h.shortlist.includes(listingId)) h.shortlist.push(listingId)
  touch(h)
  persist()
}

async function removeFromShortlist(id, listingId) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  requireActive(h)
  h.shortlist = h.shortlist.filter((x) => x !== listingId)
  touch(h)
  persist()
}

/* ---------------- Late join ---------------- */

async function lateJoin(id, { from, departMs }) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  requireActive(h)
  const plan = await getPlan(id)
  if (!plan.stops.length) return { best: null, options: [], reason: 'There is no plan yet.' }
  const pts = plan.stops.map((st) => st.listing)
  await Promise.all(pts.map((point) => prefetchLegs([from, point], departMs).catch(() => null)))
  const r = joinSuggestions({ stops: plan.stops, from, departMs, travel: travelFn(departMs) })
  return clone(r)
}
return { AREAS, INTERESTS, resetDemo, SOFT_ISSUES, ApiError, session, currentUser, listUsers, signIn, signOut, updateProfile, listListings, getListing, listMyHangouts, createHangout, updateHangout, getHangout, previewHangout, joinHangout, leaveHangout, setRequired, setStage, renewInvite, saveAvailability, clearAvailability, savePreferences, getSlots, previewSlot, lockSlot, unlockSlot, getPlan, generatePlan, setPlanStops, previewCustomStop, addCustomStop, getAlternatives, previewStops, vote, finalizePlan, reopenVoting, addToShortlist, removeFromShortlist, lateJoin }
}

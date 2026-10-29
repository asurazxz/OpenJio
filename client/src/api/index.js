// App data API. Every function is async and returns plain objects, so the demo store
// here can be replaced by a Supabase adapter with the same signatures.
// Permission checks live here, not in the views: hiding a button is not enough.

import { reactive } from 'vue'
import { load, persist, uid, token, getSessionUserId, setSessionUserId, resetDemo } from './store.js'
import { LISTINGS, AREAS, INTERESTS } from '../data/seed-listings.js'
import { rankSlots, earliestCommonSlot, heatmap, mergeIntervals } from '../lib/algo/slots.js'
import { generateItinerary, greedyItinerary, retime, alternativesFor } from '../lib/algo/itinerary.js'
import { joinSuggestions } from '../lib/algo/reachability.js'
import { travelFn, prefetchLegs, fetchDrafts } from '../lib/travel.js'
import { fromDateKey, toMs, toIso, DAY, MIN } from '../lib/time.js'

export { AREAS, INTERESTS, resetDemo }

// Warnings that do not block confirming: shown honestly, but the host may accept them.
export const SOFT_ISSUES = ['no_meal', 'unknown_hours']

const LATENCY = 90
const wait = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => JSON.parse(JSON.stringify(v))

export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/* ---------------- Session ---------------- */

export const session = reactive({ userId: null })
session.userId = getSessionUserId()

function me() {
  const s = load()
  const user = s.users.find((u) => u.id === session.userId)
  if (!user) throw new ApiError('auth', 'Please sign in first.')
  return user
}

export function currentUser() {
  const s = load()
  return s.users.find((u) => u.id === session.userId) || null
}

export async function listUsers() {
  await wait(40)
  return clone(load().users)
}

export async function signIn(userId) {
  await wait()
  const s = load()
  if (!s.users.some((u) => u.id === userId)) throw new ApiError('not_found', 'Unknown account.')
  session.userId = userId
  setSessionUserId(userId)
  return clone(currentUser())
}

export function signOut() {
  session.userId = null
  setSessionUserId(null)
}

export async function updateProfile(patch) {
  await wait()
  const user = me()
  if (patch.name != null) user.name = String(patch.name).trim().slice(0, 40) || user.name
  if (patch.homeArea !== undefined) user.homeArea = patch.homeArea
  if (patch.interests) user.interests = sanitizeWeights(patch.interests)
  persist()
  return clone(user)
}

function sanitizeWeights(w) {
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
        summary: h.description || `Open jio hosted by ${host?.name}.`,
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

function allListings(s) {
  return [...LISTINGS, ...s.published, ...openJioListings(s)]
}

/** Listings usable as itinerary stops (not open jios, not drafts). */
function stopCandidates(s) {
  return [...LISTINGS, ...s.published].filter((l) => l.status !== 'draft')
}

function findListing(s, id) {
  return allListings(s).find((l) => l.id === id) || null
}

export async function listListings() {
  await wait()
  return clone(allListings(load()))
}

export async function getListing(id) {
  await wait(40)
  const l = findListing(load(), id)
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
  return m
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
    host: clone(s.users.find((u) => u.id === h.hostId)),
    stopCount: s.itineraries[h.id]?.stops.length || 0,
  }
}

export async function listMyHangouts() {
  await wait()
  const user = me()
  const s = load()
  const ids = new Set(s.members.filter((m) => m.userId === user.id).map((m) => m.hangoutId))
  return s.hangouts
    .filter((h) => ids.has(h.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((h) => summary(s, h, user.id))
}

export async function createHangout(input) {
  await wait()
  const user = me()
  const s = load()
  const title = String(input.title || '').trim()
  if (!title) throw new ApiError('invalid', 'Give the hangout a name.')
  const area = AREAS.find((a) => a.slug === input.area) || (input.startArea?.lat ? input.startArea : null)
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
    interests: (input.interests || []).slice(0, 5),
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

/** Full hangout view for a member. Other members' raw availability is never returned. */
export async function getHangout(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const mine = requireMember(s, h, user)
  const members = s.members
    .filter((m) => m.hangoutId === id)
    .map((m) => ({ ...clone(m), user: clone(s.users.find((u) => u.id === m.userId)) }))
    .sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.joinedAt - b.joinedAt))
  return {
    hangout: summary(s, h, user.id),
    members,
    me: clone(mine),
    myAvailability: clone(s.availability[id]?.[user.id] || []),
    myPrefs: clone(s.prefs[id]?.[user.id] || null),
  }
}

/** Public preview for an invite link or open jio: no member details beyond names. */
export async function previewHangout({ token: t, id }) {
  await wait()
  const s = load()
  const h = t ? s.hangouts.find((x) => x.inviteToken === t) : s.hangouts.find((x) => x.id === id && x.visibility === 'public')
  if (!h) throw new ApiError('not_found', 'This invite link is not valid any more.')
  const members = s.members.filter((m) => m.hangoutId === h.id)
  return {
    id: h.id,
    title: h.title,
    description: h.description,
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

export async function joinHangout({ token: t, id }) {
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

export async function leaveHangout(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
  if (m.role === 'host') throw new ApiError('forbidden', 'The host cannot leave. Cancel the hangout instead.')
  s.members = s.members.filter((x) => x !== m)
  delete s.availability[id]?.[user.id]
  touch(h)
  persist()
}

export async function setRequired(id, userId, required) {
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

export async function setStage(id, stage) {
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

export async function renewInvite(id) {
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

export async function saveAvailability(id, intervals, source = 'grid') {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
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

export async function clearAvailability(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  const m = requireMember(s, h, user)
  if (s.availability[id]) delete s.availability[id][user.id]
  m.respondedAt = null
  touch(h)
  persist()
}

export async function savePreferences(id, weights) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  s.prefs[id] = s.prefs[id] || {}
  s.prefs[id][user.id] = sanitizeWeights(weights)
  touch(h)
  persist()
}

/** Ranked slots and an aggregate heatmap. Raw per-person intervals stay inside this function. */
export async function getSlots(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const members = s.members
    .filter((m) => m.hangoutId === id)
    .map((m) => ({ id: m.userId, required: m.required, responded: Boolean(m.respondedAt) }))
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
  return {
    slots: ranked.slots.map((sl) => ({ ...sl, attendeeNames: name(sl.attendees), missingNames: name(sl.missing) })),
    missingRequired: name(ranked.missingRequired),
    unknown: name(ranked.unknown),
    baseline,
    heatmap: grid,
    responded: responded.length,
    total: members.length,
  }
}

export async function lockSlot(id, slot) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!slot?.start || !slot?.end || slot.end <= slot.start) throw new ApiError('invalid', 'Choose a slot first.')
  const hadPlan = s.itineraries[id]?.stops.length > 0
  h.lockedSlot = { start: slot.start, end: slot.end }
  h.stage = 'voting'
  if (hadPlan) {
    h.planChangedAt = Date.now()
    if (s.itineraries[id]) s.itineraries[id].finalizedAt = null
  }
  touch(h)
  persist()
}

export async function unlockSlot(id) {
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
  return {
    slot: h.lockedSlot,
    start: h.startArea,
    candidates: stopCandidates(s),
    members: planMembers(s, h),
    travel: travelFn(h.lockedSlot.start),
    options: { mealWanted: h.mealWanted, ...extra },
  }
}

function tally(s, stop, memberCount) {
  const votes = Object.values(s.votes[stop.id] || {}).filter((v) => v.version === stop.version)
  const up = votes.filter((v) => v.value > 0).length
  const down = votes.filter((v) => v.value < 0).length
  return { up, down, voted: votes.length, of: memberCount, net: up - down }
}

/** Plan with timings recomputed from the slot, validation issues and vote tallies. */
export async function getPlan(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const plan = s.itineraries[id]
  if (!h.lockedSlot) return { hangoutId: id, stops: [], issues: [], needsSlot: true }
  if (!plan || !plan.stops.length) return { hangoutId: id, stops: [], issues: [], empty: true, shortlist: clone(h.shortlist.map((x) => findListing(s, x)).filter(Boolean)) }
  const listings = plan.stops.map((st) => findListing(s, st.listingId))
  const missing = listings.findIndex((l) => !l)
  if (missing !== -1) {
    return { hangoutId: id, stops: [], issues: [{ index: missing, type: 'missing', message: 'A stop was removed from the listings. Regenerate or rebuild the plan.' }], broken: true }
  }
  const r = retime(listings, planInput(s, h))
  const memberCount = s.members.filter((m) => m.hangoutId === id).length
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
      votes: tally(s, plan.stops[i], memberCount),
      myVote: (() => {
        const v = s.votes[plan.stops[i].id]?.[user.id]
        return v && v.version === plan.stops[i].version ? v.value : 0
      })(),
    })),
    shortlist: clone(h.shortlist.map((x) => findListing(s, x)).filter(Boolean)),
  }
}

function writeStops(s, h, listingIds, generatedBy, method) {
  const prev = s.itineraries[h.id]?.stops || []
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
  if (wasFinal || s.itineraries[h.id].everFinal) {
    h.planChangedAt = Date.now()
    s.itineraries[h.id].everFinal = true
  }
  if (h.stage === 'final') h.stage = 'voting'
  touch(h)
}

export async function generatePlan(id, { method = 'beam', relax = null } = {}) {
  await wait(160)
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
  const pts = [h.startArea, ...result.stops.map((st) => st.listing)]
  await prefetchLegs(pts, h.lockedSlot.start)
  writeStops(s, h, result.stops.map((st) => st.listingId), 'auto', method)
  if (relax === 'no_meal') h.mealWanted = false
  persist()
  return { ok: true }
}

export async function setPlanStops(id, listingIds) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  if (!h.lockedSlot) throw new ApiError('invalid', 'Lock a time slot first.')
  if (listingIds.length > 6) throw new ApiError('invalid', 'Keep it to 6 stops or fewer.')
  for (const lid of listingIds) if (!findListing(s, lid)) throw new ApiError('not_found', 'One of those places is not available.')
  writeStops(s, h, listingIds, 'manual', s.itineraries[id]?.method || 'manual')
  persist()
}

export async function getAlternatives(id, index) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const plan = s.itineraries[id]
  const listings = plan.stops.map((st) => findListing(s, st.listingId))
  return clone(alternativesFor(listings, index, planInput(s, h), 3))
}

/** Preview a sequence without saving: used for "check before replacing". */
export async function previewStops(id, listingIds) {
  await wait(40)
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const listings = listingIds.map((x) => findListing(s, x)).filter(Boolean)
  return clone(retime(listings, planInput(s, h)))
}

export async function vote(id, stopId, value) {
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

export async function finalizePlan(id) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireHost(s, h, user)
  const plan = s.itineraries[id]
  if (!plan?.stops.length) throw new ApiError('invalid', 'Add at least one stop first.')
  const listings = plan.stops.map((st) => findListing(s, st.listingId))
  if (listings.some((l) => !l)) throw new ApiError('invalid', 'A stop is no longer available.')
  const r = retime(listings, planInput(s, h))
  const blocking = r.issues.filter((i) => !SOFT_ISSUES.includes(i.type))
  if (blocking.length) throw new ApiError('invalid', 'Fix these first: ' + blocking.map((i) => i.message).join('; '))
  plan.finalizedAt = Date.now()
  plan.everFinal = true
  h.stage = 'final'
  h.planChangedAt = null
  touch(h)
  persist()
}

export async function reopenVoting(id) {
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

export async function addToShortlist(id, listingId) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  if (!findListing(s, listingId)) throw new ApiError('not_found', 'That listing is not available.')
  if (!h.shortlist.includes(listingId)) h.shortlist.push(listingId)
  touch(h)
  persist()
}

export async function removeFromShortlist(id, listingId) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  h.shortlist = h.shortlist.filter((x) => x !== listingId)
  touch(h)
  persist()
}

/* ---------------- Late join ---------------- */

export async function lateJoin(id, { from, departMs }) {
  await wait()
  const user = me()
  const s = load()
  const h = hangoutOrThrow(s, id)
  requireMember(s, h, user)
  const plan = await getPlan(id)
  if (!plan.stops.length) return { best: null, options: [], reason: 'There is no plan yet.' }
  const pts = plan.stops.map((st) => st.listing)
  await prefetchLegs([from, ...pts], departMs).catch(() => null)
  const r = joinSuggestions({ stops: plan.stops, from, departMs, travel: travelFn(departMs) })
  return clone(r)
}

/* ---------------- Content review (R6) ---------------- */

export async function listDrafts() {
  const user = me()
  if (!user.reviewer) throw new ApiError('forbidden', 'Only reviewers can see drafts.')
  const s = load()
  let drafts = []
  let serverError = null
  try {
    drafts = await fetchDrafts()
  } catch {
    serverError = 'The local server is not running, so new drafts cannot be loaded.'
  }
  return {
    serverError,
    drafts: drafts.map((d) => ({ ...d, review: s.reviews[d.id] || null })),
    published: clone(s.published),
  }
}

export async function publishDraft(draft) {
  await wait()
  const user = me()
  if (!user.reviewer) throw new ApiError('forbidden', 'Only reviewers can publish.')
  const s = load()
  const area = AREAS.find((a) => a.slug === draft.area)
  if (!draft.title || !area) throw new ApiError('invalid', 'A title and area are required.')
  if (draft.type === 'deal' && (!draft.validity?.dateFrom || !draft.validity?.dateTo)) {
    throw new ApiError('invalid', 'Deals need a start and end date before publishing.')
  }
  if (draft.type === 'event' && (!draft.startsAt || !draft.endsAt)) throw new ApiError('invalid', 'Events need a start and end time.')
  const lat = Number(draft.lat) || area.lat
  const lng = Number(draft.lng) || area.lng
  const listing = {
    id: `pub-${draft.id}`,
    type: draft.type,
    kind: draft.kind || (draft.type === 'deal' ? 'meal' : 'activity'),
    title: draft.title,
    summary: draft.summary || '',
    interests: draft.category ? [draft.category] : ['food'],
    area: area.slug,
    address: draft.address || area.label,
    lat,
    lng,
    durationMins: Number(draft.durationMins) || 60,
    priceLevel: 1,
    priceText: draft.priceText || 'Price not stated',
    openingHours: draft.openingHours || null,
    startsAt: draft.startsAt || undefined,
    endsAt: draft.endsAt || undefined,
    merchant: draft.merchant || undefined,
    outlets: draft.type === 'deal' ? [{ name: draft.merchant || draft.title, address: draft.address || area.label, lat, lng }] : undefined,
    validity: draft.type === 'deal' ? draft.validity : undefined,
    conditions: draft.conditions || [],
    exclusions: draft.exclusions || [],
    dealText: draft.dealText || undefined,
    source: { ...(draft.source || {}), kind: 'scraped', verifiedAt: toIso(Date.now()) },
    status: 'published',
    rawPostId: draft.rawPostId,
  }
  s.published = s.published.filter((p) => p.id !== listing.id)
  s.published.push(listing)
  s.reviews[draft.id] = { status: 'published', by: user.id, at: Date.now() }
  persist()
  return clone(listing)
}

export async function rejectDraft(draftId, reason = '') {
  await wait()
  const user = me()
  if (!user.reviewer) throw new ApiError('forbidden', 'Only reviewers can reject drafts.')
  const s = load()
  s.reviews[draftId] = { status: 'rejected', by: user.id, at: Date.now(), reason }
  persist()
}

export async function unpublish(listingId) {
  await wait()
  const user = me()
  if (!user.reviewer) throw new ApiError('forbidden', 'Only reviewers can unpublish.')
  const s = load()
  s.published = s.published.filter((p) => p.id !== listingId)
  persist()
}

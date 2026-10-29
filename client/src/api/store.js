// Demo-mode persistence. Shared data lives in localStorage so several tabs act as
// separate people on the same "backend"; who is signed in lives in sessionStorage per tab.

import { ref } from 'vue'
import { PERSONAS } from '../data/personas.js'
import { AREAS, LISTINGS } from '../data/seed-listings.js'
import { sgTime, toIso, HOUR } from '../lib/time.js'
import { generateItinerary } from '../lib/algo/itinerary.js'

const KEY = 'openjio:demo:v1'
const SESSION_KEY = 'openjio:session'

/** Bumped on every change (this tab or another) so views can reload. */
export const revision = ref(0)

let state = null

function safeGet(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value)
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

export function load() {
  if (state) return state
  const raw = safeGet(localStorage, KEY)
  if (raw) {
    try {
      state = JSON.parse(raw)
    } catch {
      state = null
    }
  }
  if (!state || state.version !== 1) {
    state = seedState()
    persist()
  }
  return state
}

export function persist() {
  safeSet(localStorage, KEY, JSON.stringify(state))
  revision.value++
}

export function resetDemo() {
  state = seedState()
  persist()
}

export function getSessionUserId() {
  return safeGet(sessionStorage, SESSION_KEY) || safeGet(localStorage, SESSION_KEY)
}
export function setSessionUserId(id) {
  if (id) {
    safeSet(sessionStorage, SESSION_KEY, id)
    safeSet(localStorage, SESSION_KEY, id)
  } else {
    try {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue)
        revision.value++
      } catch {
        /* ignore malformed */
      }
    }
  })
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function token() {
  return Math.random().toString(36).slice(2, 10)
}

const area = (slug) => AREAS.find((a) => a.slug === slug)

/** Daily free intervals between two hours across several days. */
function daily(days, fromH, toH) {
  return days.map(([y, m, d]) => ({ start: sgTime(y, m, d, fromH), end: sgTime(y, m, d, toH), source: 'grid' }))
}

function seedState() {
  const now = Date.now()
  const s = {
    version: 1,
    users: PERSONAS.map((p) => ({ ...p })),
    hangouts: [],
    members: [],
    availability: {},
    prefs: {},
    itineraries: {},
    votes: {},
    published: [],
    reviews: {},
  }

  // 1. A group hangout still collecting availability (Jun has not responded).
  const h1 = {
    id: 'h-catchup',
    hostId: 'u-mei',
    title: 'Saturday catch-up',
    mode: 'group',
    visibility: 'private',
    capacity: null,
    inviteToken: 'catchup1',
    stage: 'collecting',
    dateFrom: '2026-11-13',
    dateTo: '2026-11-15',
    startArea: area('city-hall'),
    interests: ['food', 'arts', 'games'],
    mealWanted: true,
    lockedSlot: null,
    shortlist: [],
    createdAt: now - 2 * 24 * HOUR,
    updatedAt: now - 2 * 24 * HOUR,
    planChangedAt: null,
  }
  s.hangouts.push(h1)
  for (const [userId, role, required] of [
    ['u-mei', 'host', true],
    ['u-arjun', 'member', false],
    ['u-farah', 'member', true],
    ['u-jun', 'member', false],
  ]) {
    s.members.push({ hangoutId: h1.id, userId, role, required, respondedAt: userId === 'u-jun' ? null : now - 24 * HOUR, joinedAt: now - 2 * 24 * HOUR })
  }
  s.availability[h1.id] = {
    'u-mei': [...daily([[2026, 11, 13]], 19, 23), ...daily([[2026, 11, 14], [2026, 11, 15]], 10, 22)],
    'u-arjun': [...daily([[2026, 11, 14]], 12, 20), ...daily([[2026, 11, 15]], 14, 21)],
    'u-farah': [...daily([[2026, 11, 13]], 18, 22), ...daily([[2026, 11, 14]], 13, 19), ...daily([[2026, 11, 15]], 10, 13)],
  }
  s.prefs[h1.id] = {}

  // 2. A public open jio with a fixed slot and a generated draft plan.
  const h2 = {
    id: 'h-hawker',
    hostId: 'u-priya',
    title: 'Sunday Chinatown wander',
    mode: 'group',
    visibility: 'public',
    capacity: 6,
    inviteToken: 'wander22',
    stage: 'voting',
    dateFrom: '2026-11-15',
    dateTo: '2026-11-15',
    startArea: area('chinatown'),
    interests: ['food', 'markets', 'arts'],
    mealWanted: true,
    lockedSlot: { start: sgTime(2026, 11, 15, 11), end: sgTime(2026, 11, 15, 16) },
    shortlist: [],
    createdAt: now - 26 * HOUR,
    updatedAt: now - 26 * HOUR,
    planChangedAt: null,
    description: 'Easy-paced lunch and a wander. All welcome, come solo.',
  }
  s.hangouts.push(h2)
  for (const userId of ['u-priya', 'u-jun']) {
    s.members.push({ hangoutId: h2.id, userId, role: userId === 'u-priya' ? 'host' : 'member', required: userId === 'u-priya', respondedAt: now, joinedAt: now - 20 * HOUR })
  }
  seedPlan(s, h2)

  // 3. A finalised Friday dinner so the companion and late-join view can be tried.
  const h3 = {
    id: 'h-friday',
    hostId: 'u-daniel',
    title: 'Friday night makan',
    mode: 'group',
    visibility: 'private',
    capacity: null,
    inviteToken: 'friday33',
    stage: 'final',
    dateFrom: '2026-11-06',
    dateTo: '2026-11-06',
    startArea: area('bugis'),
    interests: ['food', 'nightlife', 'music'],
    mealWanted: true,
    lockedSlot: { start: sgTime(2026, 11, 6, 18), end: sgTime(2026, 11, 6, 23) },
    shortlist: [],
    createdAt: now - 5 * 24 * HOUR,
    updatedAt: now - 3 * 24 * HOUR,
    planChangedAt: null,
  }
  s.hangouts.push(h3)
  for (const userId of ['u-daniel', 'u-mei', 'u-farah', 'u-arjun']) {
    s.members.push({ hangoutId: h3.id, userId, role: userId === 'u-daniel' ? 'host' : 'member', required: userId === 'u-daniel', respondedAt: now - 4 * 24 * HOUR, joinedAt: now - 5 * 24 * HOUR })
  }
  seedPlan(s, h3)
  s.itineraries[h3.id].finalizedAt = now - 3 * 24 * HOUR

  return s
}

function seedPlan(s, h) {
  const members = s.members
    .filter((m) => m.hangoutId === h.id)
    .map((m) => ({ id: m.userId, interests: s.users.find((u) => u.id === m.userId).interests }))
  const result = generateItinerary({
    slot: h.lockedSlot,
    start: h.startArea,
    candidates: LISTINGS,
    members,
    options: { mealWanted: h.mealWanted },
  })
  s.itineraries[h.id] = {
    generatedBy: 'auto',
    method: 'beam',
    createdAt: Date.now(),
    finalizedAt: null,
    stops: (result.stops || []).map((st) => ({
      id: uid('st'),
      listingId: st.listingId,
      version: 1,
    })),
  }
}

export { toIso }

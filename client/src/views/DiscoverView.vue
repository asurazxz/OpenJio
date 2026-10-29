<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listListings, listMyHangouts, addToShortlist, currentUser, session, AREAS, INTERESTS } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { rankListings } from '../lib/algo/discover.js'
import { fmtRange, fmtDateKey, toMs, sgParts, sgTime, DAY, HOUR } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE, interestLabel, areaLabel, sourceLine } from '../lib/labels.js'
import { toast, toastError } from '../lib/toast.js'
import ListingCard from '../components/ListingCard.vue'
import MapView from '../components/MapView.vue'
import AppDialog from '../components/AppDialog.vue'
import EmptyState from '../components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const { data: listings, loading } = useLive(listListings)
const { data: mine } = useLive(() => (session.userId ? listMyHangouts() : Promise.resolve([])))
const user = computed(() => (session.userId ? currentUser() : null))

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const type = ref(typeof route.query.type === 'string' ? route.query.type : 'all')
const picked = ref([])
const forYou = ref(true)
const area = ref('')
const when = ref(typeof route.query.for === 'string' ? `h:${route.query.for}` : 'any')
const view = ref('list')
const active = ref(null)

watch([q, type], () => router.replace({ query: { ...route.query, q: q.value || undefined, type: type.value !== 'all' ? type.value : undefined } }))

const types = [
  { key: 'all', label: 'Everything' },
  { key: 'place', label: 'Places' },
  { key: 'event', label: 'Events' },
  { key: 'deal', label: 'Deals' },
  { key: 'hangout', label: 'Open jios' },
]

function weekend() {
  const now = Date.now()
  const w = sgParts(now).weekday
  const toSat = (6 - w + 7) % 7
  const sat = sgParts(now + toSat * DAY)
  const start = sgTime(sat.year, sat.month, sat.day, 9)
  return { start: Math.max(start, now), end: start + DAY + 14 * HOUR }
}
const activeHangouts = computed(() => (mine.value || []).filter((h) => !['ended', 'cancelled'].includes(h.stage)))
const timeOptions = computed(() => [
  { key: 'any', label: 'Any time' },
  { key: 'weekend', label: 'This weekend' },
  ...activeHangouts.value.filter((h) => h.lockedSlot).map((h) => ({ key: `h:${h.id}`, label: `During "${h.title}"` })),
])
const timeWindow = computed(() => {
  if (when.value === 'weekend') return weekend()
  if (when.value.startsWith('h:')) {
    const h = activeHangouts.value.find((x) => x.id === when.value.slice(2))
    return h?.lockedSlot || null
  }
  return null
})

const interestWeights = computed(() => {
  if (picked.value.length) return Object.fromEntries(picked.value.map((s) => [s, 1]))
  if (forYou.value && user.value) return user.value.interests
  return {}
})
const near = computed(() => {
  const slug = area.value || user.value?.homeArea
  const a = AREAS.find((x) => x.slug === slug)
  return a ? { lat: a.lat, lng: a.lng } : null
})

const results = computed(() => {
  const list = (listings.value || []).filter((l) => {
    if (type.value !== 'all' && l.type !== type.value) return false
    if (area.value && l.area !== area.value) return false
    if (picked.value.length && !(l.interests || []).some((i) => picked.value.includes(i))) return false
    if (l.type === 'event' || l.type === 'hangout') {
      if (toMs(l.endsAt) < Date.now()) return false
    }
    if (l.type === 'deal' && l.validity?.dateTo && l.validity.dateTo < fmtKeyNow()) return false
    const s = q.value.trim().toLowerCase()
    if (s && !`${l.title} ${l.summary} ${l.merchant || ''} ${areaLabel(l.area)}`.toLowerCase().includes(s)) return false
    return true
  })
  const ranked = rankListings(list, { interests: interestWeights.value, near: near.value, window: timeWindow.value })
  return timeWindow.value ? ranked.filter((r) => r.available) : ranked
})
function fmtKeyNow() {
  const p = sgParts(Date.now())
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

const markers = computed(() =>
  results.value.slice(0, 60).map((r) => ({
    id: r.listing.id,
    lat: r.listing.lat,
    lng: r.listing.lng,
    title: r.listing.title,
    label: '',
    tone: { place: 'teal', event: 'plum', deal: 'mustard', hangout: 'tomato' }[r.listing.type],
    active: active.value === r.listing.id,
  })),
)
function selectFromMap(id) {
  active.value = id
  document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function toggleInterest(slug) {
  picked.value = picked.value.includes(slug) ? picked.value.filter((s) => s !== slug) : [...picked.value, slug]
}
function clearFilters() {
  q.value = ''
  type.value = 'all'
  picked.value = []
  area.value = ''
  when.value = 'any'
}
const filtered = computed(() => q.value || type.value !== 'all' || picked.value.length || area.value || when.value !== 'any')

/* Detail and add-to-plan */
const detail = ref(null)
const adding = ref(null)
const target = ref('')

function onAdd(l) {
  if (l.type === 'hangout') {
    router.push(`/o/${l.hangoutId}`)
    return
  }
  if (!session.userId) {
    router.push({ name: 'signin', query: { next: route.fullPath } })
    return
  }
  adding.value = l
  target.value = typeof route.query.for === 'string' ? route.query.for : activeHangouts.value[0]?.id || ''
}
async function confirmAdd() {
  try {
    await addToShortlist(target.value, adding.value.id)
    const h = activeHangouts.value.find((x) => x.id === target.value)
    toast(`Added to the shortlist for ${h?.title}`)
    adding.value = null
  } catch (e) {
    toastError(e)
  }
}

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']]
const fmtHours = (w) => (w?.length ? w.map(([a, b]) => `${a} to ${b === '23:59' ? 'midnight' : b}`).join(', ') : 'Closed')
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Discover</h1>
      <p>Places, events, deals and open jios around Singapore, ranked for {{ user ? 'you' : 'everyone' }}. Every listing shows where it came from.</p>
    </header>

    <div class="filters card-x">
      <div class="f-row">
        <div class="search">
          <label for="q" class="visually-hidden">Search</label>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5 12 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          <input id="q" v-model="q" type="search" class="form-control" placeholder="Search kopi, bouldering, Katong..." />
        </div>
        <div class="f-selects">
          <label class="visually-hidden" for="area-f">Area</label>
          <select id="area-f" v-model="area" class="form-select">
            <option value="">Anywhere</option>
            <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
          </select>
          <label class="visually-hidden" for="when-f">When</label>
          <select id="when-f" v-model="when" class="form-select">
            <option v-for="t in timeOptions" :key="t.key" :value="t.key">{{ t.label }}</option>
          </select>
        </div>
      </div>
      <div class="chip-row mt-3" role="group" aria-label="Type">
        <button v-for="t in types" :key="t.key" type="button" class="chip" :aria-pressed="type === t.key" @click="type = t.key">{{ t.label }}</button>
      </div>
      <div class="chip-row mt-2" role="group" aria-label="Interests">
        <button v-if="user" type="button" class="chip" :aria-pressed="forYou && !picked.length" :title="'Rank by your profile interests'" @click="forYou = !forYou; picked = []">For you</button>
        <button v-for="i in INTERESTS" :key="i.slug" type="button" class="chip" :aria-pressed="picked.includes(i.slug)" @click="toggleInterest(i.slug)">{{ i.label }}</button>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center my-3 gap-2 flex-wrap">
      <p class="m-0 small muted" role="status">
        {{ results.length }} {{ results.length === 1 ? 'result' : 'results' }}<template v-if="timeWindow"> that fit {{ fmtRange(timeWindow.start, timeWindow.end) }}</template>
        <button v-if="filtered" type="button" class="btn btn-ghost btn-sm" @click="clearFilters">Clear filters</button>
      </p>
      <div class="seg d-lg-none" role="tablist" aria-label="Display">
        <button type="button" role="tab" :aria-selected="view === 'list'" :class="{ on: view === 'list' }" @click="view = 'list'">List</button>
        <button type="button" role="tab" :aria-selected="view === 'map'" :class="{ on: view === 'map' }" @click="view = 'map'">Map</button>
      </div>
    </div>

    <div v-if="loading" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <div v-else class="split">
      <div class="list-col" :class="{ 'd-none d-lg-block': view === 'map' }">
        <EmptyState v-if="!results.length" title="Nothing matches" body="Try another area or time, or clear the filters." tone="teal">
          <button type="button" class="btn btn-secondary" @click="clearFilters">Clear filters</button>
        </EmptyState>
        <ul v-else class="cards">
          <li v-for="r in results" :id="`card-${r.listing.id}`" :key="r.listing.id" @mouseenter="active = r.listing.id">
            <ListingCard :listing="r.listing" :km="near ? r.km : null" :available="r.available" :active="active === r.listing.id" @add="onAdd" @open="detail = $event" />
          </li>
        </ul>
      </div>
      <div class="map-col" :class="{ 'd-none d-lg-block': view === 'list' }">
        <div class="map-sticky">
          <MapView :markers="markers" height="calc(100vh - 180px)" @select="selectFromMap" />
          <div class="legend small">
            <span><i class="dot teal"></i>Place</span><span><i class="dot plum"></i>Event</span><span><i class="dot mustard"></i>Deal</span><span><i class="dot tomato"></i>Open jio</span>
          </div>
        </div>
      </div>
    </div>

    <p class="small muted mt-4">Sources: OpenJio sample data (curated for this demo), public posts from Singapore Telegram channels (@sgfooddeals, @sgweekend, @sgconcerts, @dateideas, @sgstudentpromos) and confirmgood.com, reviewed before publishing. Map tiles from OneMap, Singapore Land Authority.</p>

    <AppDialog :open="!!detail" :title="detail?.title || ''" @close="detail = null">
      <template v-if="detail">
        <div class="d-flex gap-2 mb-2 flex-wrap">
          <span class="tag" :class="TYPE_TONE[detail.type]">{{ TYPE_LABEL[detail.type] }}</span>
          <span v-for="i in detail.interests" :key="i" class="tag">{{ interestLabel(i) }}</span>
        </div>
        <p>{{ detail.summary }}</p>
        <dl class="facts">
          <div><dt>Where</dt><dd>{{ detail.address }}</dd></div>
          <div v-if="detail.priceText"><dt>Price</dt><dd>{{ detail.priceText }}</dd></div>
          <div v-if="detail.startsAt"><dt>When</dt><dd>{{ fmtRange(toMs(detail.startsAt), toMs(detail.endsAt)) }}</dd></div>
          <div v-if="detail.dealText"><dt>Deal</dt><dd>{{ detail.dealText }}<span v-if="detail.merchant"> at {{ detail.merchant }}</span></dd></div>
          <div v-if="detail.validity"><dt>Valid</dt><dd>
            {{ fmtDateKey(detail.validity.dateFrom) }} to {{ fmtDateKey(detail.validity.dateTo) }}<template v-if="detail.validity.daysOfWeek?.length && detail.validity.daysOfWeek.length < 7">, {{ detail.validity.daysOfWeek.map((d) => d[0] + d.slice(1).toLowerCase()).join(', ') }}</template><template v-if="detail.validity.timeWindows?.length">, {{ detail.validity.timeWindows.map((w) => `${w.start} to ${w.end}`).join(', ') }}</template>
          </dd></div>
          <div v-if="detail.conditions?.length"><dt>Conditions</dt><dd>{{ detail.conditions.join('; ') }}</dd></div>
          <div v-if="detail.exclusions?.length"><dt>Not valid</dt><dd>{{ detail.exclusions.join('; ') }}</dd></div>
          <div v-if="detail.type !== 'event' && detail.type !== 'hangout'"><dt>Hours</dt><dd>
            <template v-if="detail.openingHours">
              <span v-for="[k, lbl] in DAYS" :key="k" class="d-block small">{{ lbl }}: {{ fmtHours(detail.openingHours[k]) }}</span>
            </template>
            <template v-else>Unknown. We will not schedule this automatically.</template>
          </dd></div>
          <div><dt>Source</dt><dd>
            {{ sourceLine(detail) }}
            <a v-if="detail.source?.url" :href="detail.source.url" target="_blank" rel="noopener noreferrer">View original</a>
          </dd></div>
        </dl>
        <p v-if="detail.sample" class="small muted">Sample listing for the demo. Hours and prices are approximate; event and deal names are made up.</p>
        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-primary" @click="onAdd(detail); detail = null">{{ detail.type === 'hangout' ? 'View open jio' : 'Add to a plan' }}</button>
        </div>
      </template>
    </AppDialog>

    <AppDialog :open="!!adding" title="Add to a plan" @close="adding = null">
      <template v-if="adding">
        <p class="muted">Adds <strong>{{ adding.title }}</strong> to a hangout's shortlist. The host can drop it into the plan.</p>
        <template v-if="activeHangouts.length">
          <fieldset>
            <legend class="form-label">Which hangout?</legend>
            <div class="d-grid gap-2">
              <label v-for="h in activeHangouts" :key="h.id" class="pick" :class="{ on: target === h.id }">
                <input v-model="target" type="radio" name="target" :value="h.id" class="form-check-input me-2" />
                <span><strong>{{ h.title }}</strong><br /><span class="small muted">{{ h.lockedSlot ? fmtRange(h.lockedSlot.start, h.lockedSlot.end) : 'Time not set yet' }}</span></span>
              </label>
            </div>
          </fieldset>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-ghost" @click="adding = null">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="!target" @click="confirmAdd">Add to shortlist</button>
          </div>
        </template>
        <EmptyState v-else title="No active plans" body="Start a plan first, then add places to it.">
          <RouterLink to="/new" class="btn btn-primary">New plan</RouterLink>
        </EmptyState>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.filters { padding: 16px; }
.f-row { display: flex; flex-wrap: wrap; gap: 10px; }
.search { position: relative; flex: 1 1 260px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-3); }
.search .form-control { padding-left: 38px; }
.f-selects { display: flex; gap: 10px; flex: 1 1 300px; }
.f-selects .form-select { flex: 1; min-width: 0; }
.seg { display: flex; background: var(--paper-2); border-radius: 999px; padding: 4px; }
.seg button { border: 0; background: none; padding: 6px 16px; border-radius: 999px; font-weight: 650; color: var(--ink-2); }
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.split { display: grid; gap: 20px; }
.split > *, .cards > li { min-width: 0; }
.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.map-sticky { position: sticky; top: calc(var(--header-h) + 16px); }
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; color: var(--ink-2); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; border: 1px solid var(--line-strong); }
.dot.teal { background: var(--teal); } .dot.plum { background: var(--plum); } .dot.mustard { background: var(--mustard); } .dot.tomato { background: var(--tomato); }
.facts { display: grid; gap: 8px; margin-bottom: 14px; }
.facts div { display: grid; grid-template-columns: 96px 1fr; gap: 10px; }
dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); padding-top: 3px; }
dd { margin: 0; }
.pick { display: flex; align-items: flex-start; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; background: var(--paper); }
.pick.on { border-color: var(--line-strong); background: var(--mustard-soft); }
@media (min-width: 576px) {
  .cards { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 992px) {
  .split { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
  .cards { grid-template-columns: 1fr; }
}
@media (min-width: 1200px) {
  .cards { grid-template-columns: repeat(2, 1fr); }
}
</style>

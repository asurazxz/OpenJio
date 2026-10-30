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
import CategoryIcon from '../components/brand/CategoryIcon.vue'
import ListingDetails from '../components/ListingDetails.vue'

const route = useRoute()
const router = useRouter()
const { data: listings, loading, error, reload } = useLive(listListings)
const { data: mine } = useLive(() => (session.userId ? listMyHangouts() : Promise.resolve([])))
const user = computed(() => (session.userId ? currentUser() : null))

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const type = ref(typeof route.query.type === 'string' ? route.query.type : 'all')
const picked = ref(typeof route.query.tags === 'string' ? route.query.tags.split(',').filter((x) => INTERESTS.some((i) => i.slug === x)) : [])
const filtersOpen = ref(false)
const forYou = ref(true)
const area = ref(typeof route.query.area === 'string' ? route.query.area : '')
const when = ref(typeof route.query.when === 'string' ? route.query.when : typeof route.query.for === 'string' ? `h:${route.query.for}` : 'any')
const view = ref(route.query.view === 'cards' ? 'cards' : 'map')
const active = ref(null)

watch(() => route.query, (query) => {
  q.value = typeof query.q === 'string' ? query.q : ''
  type.value = types.some((t) => t.key === query.type) ? query.type : 'all'
  area.value = typeof query.area === 'string' ? query.area : ''
  when.value = typeof query.when === 'string' ? query.when : typeof query.for === 'string' ? `h:${query.for}` : 'any'
  view.value = query.view === 'cards' ? 'cards' : 'map'
  const tags = typeof query.tags === 'string' ? query.tags.split(',').filter((x) => INTERESTS.some((i) => i.slug === x)) : []
  if (tags.join(',') !== picked.value.join(',')) picked.value = tags
})
watch([q, type, area, when, view, picked], () => {
  router.replace({ query: { ...route.query, q: q.value || undefined, type: type.value !== 'all' ? type.value : undefined,
    area: area.value || undefined, when: when.value !== 'any' ? when.value : route.query.for ? 'any' : undefined,
    view: view.value === 'cards' ? 'cards' : undefined, tags: picked.value.join(',') || undefined } })
}, { deep: true })
const filterCount = computed(() => picked.value.length)


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
      if (toMs(l.endsAt) && toMs(l.endsAt) < Date.now()) return false
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
  results.value.map((r) => ({
    id: r.listing.id,
    lat: r.listing.lat,
    lng: r.listing.lng,
    title: r.listing.title,
    label: '',
    tone: { place: 'teal', event: 'plum', deal: 'mustard', hangout: 'tomato' }[r.listing.type],
    active: active.value === r.listing.id,
    preview: {
      kind: `${TYPE_LABEL[r.listing.type]} · ${areaLabel(r.listing.area)}`,
      location: r.listing.address || areaLabel(r.listing.area),
      when: r.listing.startsAt && r.listing.endsAt ? fmtRange(toMs(r.listing.startsAt), toMs(r.listing.endsAt)) : '',
      price: r.listing.priceText,
      spots: r.listing.type === 'hangout' && r.listing.capacity ? `${Math.max(0, r.listing.capacity - r.listing.memberCount)} spots left` : '',
    },
  })),
)
function selectFromMap(id) {
  active.value = id
  detail.value = results.value.find((r) => r.listing.id === id)?.listing || null
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
const addingBusy = ref(false)

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
  if (addingBusy.value) return
  addingBusy.value = true
  try {
    await addToShortlist(target.value, adding.value.id)
    const h = activeHangouts.value.find((x) => x.id === target.value)
    toast(`Added to the shortlist for ${h?.title}`)
    adding.value = null
  } catch (e) {
    toastError(e)
  } finally {
    addingBusy.value = false
  }
}

</script>

<template>
  <div class="page discover-page">
    <header class="page-head" data-tour="discover-intro">
      <template v-if="type === 'hangout'">
        <h1>Open jios</h1>
        <p>Public hangouts with spots left. Have a look, then join if it suits you.</p>
      </template>
      <template v-else>
        <h1>Discover</h1>
        <p>Find your next stop. Explore Singapore on the map, then make it a plan.</p>
      </template>
    </header>

    <div class="filters card-x" data-tour="discover-filters">
      <div class="f-row">
        <div class="search">
          <label for="q" class="visually-hidden">Search</label>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5 12 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          <input id="q" v-model="q" type="search" class="form-control" placeholder="Search kopi, bouldering, Katong…" />
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
        <button type="button" class="btn btn-secondary filter-toggle" :aria-expanded="filtersOpen" aria-controls="interest-filters" @click="filtersOpen = !filtersOpen">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          Filters <span v-if="filterCount" class="filter-count">{{ filterCount }}</span>
        </button>
      </div>
      <div class="chip-row type-row" role="group" aria-label="Type">
        <button v-for="t in types" :key="t.key" type="button" class="chip" :aria-pressed="type === t.key" @click="type = t.key">{{ t.label }}</button>
      </div>
      <section v-if="filtersOpen" id="interest-filters" class="interest-filters" aria-label="More filters">
        <div class="filter-heading"><h2 class="h6 m-0">What are you in the mood for?</h2><button v-if="picked.length" type="button" class="btn btn-ghost btn-sm" @click="picked = []">Reset tags</button></div>
        <div class="chip-row" role="group" aria-label="Interests">
          <button v-for="i in INTERESTS" :key="i.slug" type="button" class="chip" :aria-pressed="picked.includes(i.slug)" @click="toggleInterest(i.slug)"><CategoryIcon :name="i.slug" :size="16" />{{ i.label }}</button>
        </div>
        <label v-if="user" class="personalise"><input v-model="forYou" type="checkbox" class="form-check-input" /> Use my interests to rank results</label>
      </section>
      <div v-else-if="picked.length" class="active-filters" aria-label="Selected interests"><span class="small muted">Filtered by</span><button v-for="tag in picked" :key="tag" type="button" class="chip" :aria-label="`Remove ${interestLabel(tag)} filter`" @click="toggleInterest(tag)">{{ interestLabel(tag) }} <span aria-hidden="true">×</span></button></div>
    </div>

    <div class="d-flex justify-content-between align-items-center my-3 gap-2 flex-wrap">
      <p class="m-0 small muted" role="status">
        {{ results.length }} {{ results.length === 1 ? 'result' : 'results' }}<template v-if="timeWindow"> that fit {{ fmtRange(timeWindow.start, timeWindow.end) }}</template>
        <button v-if="filtered" type="button" class="btn btn-ghost btn-sm" @click="clearFilters">Clear filters</button>
      </p>
      <div class="seg" role="group" aria-label="Display" data-tour="discover-view">
        <button type="button" aria-label="Map view" :aria-pressed="view === 'map'" :class="{ on: view === 'map' }" @click="view = 'map'">Map</button>
        <button type="button" aria-label="Cards view" :aria-pressed="view === 'cards'" :class="{ on: view === 'cards' }" @click="view = 'cards'">Cards</button>
      </div>
    </div>

    <div v-if="loading" class="py-5 text-center"><span class="spinner-border" aria-label="Loading"></span></div>
    <div v-else-if="error" class="notice danger" role="alert"><p>We could not load the listings. Your filters are still here.</p><button type="button" class="btn btn-secondary" @click="reload">Try again</button></div>
    <div v-else class="split" :class="view + '-mode'">
      <div class="list-col">
        <EmptyState v-if="!results.length" title="Nothing matches" body="Try another area or time, or clear the filters." tone="teal">
          <button type="button" class="btn btn-secondary" @click="clearFilters">Clear filters</button>
        </EmptyState>
        <ul v-else class="cards">
          <li v-for="r in results" :id="`card-${r.listing.id}`" :key="r.listing.id" @mouseenter="active = r.listing.id">
            <ListingCard :listing="r.listing" :km="near ? r.km : null" :available="r.available" :active="active === r.listing.id" @add="onAdd" @open="detail = $event" />
          </li>
        </ul>
      </div>
      <div class="map-col" v-show="view === 'map'">
        <div class="map-sticky" data-tour="discover-map">
          <MapView :markers="markers" scroll-wheel-zoom height="clamp(380px, 65vh, 720px)" @select="selectFromMap" />
          <div class="legend small">
            <span><i class="dot teal"></i>Place</span><span><i class="dot plum"></i>Event</span><span><i class="dot mustard"></i>Deal</span><span><i class="dot tomato"></i>Open jio</span>
          </div>
        </div>
      </div>
    </div>

    <p class="small muted mt-4">Sources: OpenJio sample data (curated for this demo), public posts from Singapore Telegram channels (@sgfooddeals, @sgweekend, @sgconcerts, @dateideas, @sgstudentpromos) and confirmgood.com, reviewed before publishing. Map tiles from OneMap, Singapore Land Authority.</p>

    <AppDialog :open="!!detail" :title="detail?.title || ''" wide @close="detail = null">
      <ListingDetails v-if="detail" :listing="detail" @add="onAdd(detail); detail = null" />
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
            <button type="button" class="btn btn-primary" :disabled="!target || addingBusy" @click="confirmAdd">{{ addingBusy ? 'Adding…' : 'Add to shortlist' }}</button>
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
.discover-page { max-width: 1480px; }
.filters { padding: 14px 16px; }
.f-row { display: flex; flex-wrap: wrap; gap: 10px; }
.search { position: relative; flex: 1 1 280px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-2); }
.search .form-control { padding-left: 38px; }
.f-selects { display: flex; gap: 10px; flex: 1 1 300px; }
.f-selects .form-select { flex: 1; min-width: 0; }
.filter-toggle { flex: 0 0 auto; }
.filter-count { display: inline-grid; place-items: center; min-width: 23px; height: 23px; background: var(--tomato-soft); color: var(--tomato-ink); border-radius: 50%; }
.type-row { margin-top: 12px; }
.interest-filters { border-top: 1px solid var(--line); padding-top: 14px; margin-top: 14px; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 10px; }
.personalise { display: inline-flex; gap: 8px; align-items: center; margin-top: 14px; font-size: 0.9rem; }
.active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.seg { display: flex; background: var(--paper-2); border-radius: 14px; padding: 4px; }
.seg button { border: 0; background: none; min-height: 44px; padding: 8px 16px; border-radius: 11px; font-weight: 700; color: var(--ink-2); }
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.split { display: grid; gap: 20px; }
.split > *, .cards > li { min-width: 0; }
.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.map-mode .map-col { width: 100%; }
.map-mode .list-col { display: none; }
.map-sticky { width: 100%; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; color: var(--ink-2); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
.dot.teal { background: var(--teal); } .dot.plum { background: var(--plum); } .dot.mustard { background: var(--mustard); } .dot.tomato { background: var(--tomato); }
.pick { display: flex; align-items: flex-start; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; cursor: pointer; background: var(--card); }
.pick.on { border-color: var(--tomato); background: var(--tomato-soft); }
@media (max-width: 575.98px) { .filter-toggle { flex: 1; } .seg { width: 100%; } .seg button { flex: 1; } }
@media (min-width: 576px) { .cards-mode .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 992px) {
  .cards-mode .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>

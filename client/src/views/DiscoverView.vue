<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listListings, listMyHangouts, addToShortlist, currentUser, session, AREAS, INTERESTS } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { rankListings, capByKind, whenWindow, pinLabel, listingIcon } from '../lib/algo/discover.js'
import { fmtRange, toMs, sgParts } from '../lib/time.js'
import { interestLabel, areaLabel } from '../lib/labels.js'
import { toast, toastError } from '../lib/toast.js'
import ListingCard from '../components/ListingCard.vue'
import MapView from '../components/MapView.vue'
import AppDialog from '../components/AppDialog.vue'
import EmptyState from '../components/EmptyState.vue'
import CategoryIcon from '../components/brand/CategoryIcon.vue'
import ListingDetails from '../components/ListingDetails.vue'
import ResultRow from '../components/discover/ResultRow.vue'
import PreviewCard from '../components/discover/PreviewCard.vue'

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
// Open Jios are picked by time and spots rather than place, so that view opens on Cards. An explicit ?view= wins.
const viewFor = (query) => (query.view === 'map' || query.view === 'cards' ? query.view : query.type === 'hangout' ? 'cards' : 'map')
const view = ref(viewFor(route.query))
const active = ref(null)
// Caps: the map draws at most MAP_PIN_LIMIT pins; Cards load CARD_PAGE at a time.
const MAP_PIN_LIMIT = 30
// The map opens on the best few matches rather than every pin, so the first view is close enough to read.
const FIT_TOP = 12
const CARD_PAGE = 24
const visibleCards = ref(CARD_PAGE)

watch(() => route.query, (query) => {
  q.value = typeof query.q === 'string' ? query.q : ''
  type.value = types.some((t) => t.key === query.type) ? query.type : 'all'
  area.value = typeof query.area === 'string' ? query.area : ''
  when.value = typeof query.when === 'string' ? query.when : typeof query.for === 'string' ? `h:${query.for}` : 'any'
  view.value = viewFor(query)
  const tags = typeof query.tags === 'string' ? query.tags.split(',').filter((x) => INTERESTS.some((i) => i.slug === x)) : []
  if (tags.join(',') !== picked.value.join(',')) picked.value = tags
})
watch([q, type, area, when, picked], () => { visibleCards.value = CARD_PAGE })
watch([q, type, area, when, view, picked], () => {
  router.replace({ query: { ...route.query, q: q.value || undefined, type: type.value !== 'all' ? type.value : undefined,
    area: area.value || undefined, when: when.value !== 'any' ? when.value : route.query.for ? 'any' : undefined,
    view: view.value !== viewFor({ type: type.value }) ? view.value : undefined, tags: picked.value.join(',') || undefined } })
}, { deep: true })
const filterCount = computed(() => picked.value.length + (area.value ? 1 : 0))


const types = [
  { key: 'deal', label: 'Deals' },
  { key: 'event', label: 'Events' },
  { key: 'place', label: 'Places' },
  { key: 'hangout', label: 'Open Jios' },
]

const hangoutView = computed(() => type.value === 'hangout')
function setType(key) {
  if ((key === 'hangout') !== hangoutView.value) view.value = viewFor({ type: key })
  type.value = key
}
// A pressed type chip is released by pressing it again.
const toggleType = (key) => setType(type.value === key ? 'all' : key)

const activeHangouts = computed(() => (mine.value || []).filter((h) => !['ended', 'cancelled'].includes(h.stage)))
const whenChips = [
  { key: 'any', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
]
const duringOptions = computed(() => activeHangouts.value.filter((h) => h.lockedSlot).map((h) => ({ key: `h:${h.id}`, label: `During "${h.title}"` })))
const timeWindow = computed(() => {
  if (['today', 'tonight', 'weekend'].includes(when.value)) return whenWindow(when.value)
  if (when.value.startsWith('h:')) {
    const h = activeHangouts.value.find((x) => x.id === when.value.slice(2))
    return h?.lockedSlot || null
  }
  return null
})
const windowText = computed(() => {
  if (when.value === 'today') return 'today'
  if (when.value === 'tonight') return 'tonight'
  return timeWindow.value ? fmtRange(timeWindow.value.start, timeWindow.value.end) : ''
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

// The home area is the reference point only when no area is picked; a picked area narrows the results instead.
const nearHome = computed(() => (!area.value && near.value && user.value ? AREAS.find((x) => x.slug === user.value.homeArea) : null))

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

/* Map and the "in this area" list. `searched` is the viewport the list was last searched for; null means the
   whole result set (the map fits it on load and whenever the filters change). Panning only offers
   "Search this area"; the list changes when it is pressed. */
const mapRef = ref(null)
const hoverId = ref(null)
const selectedId = ref(null)
const searched = ref(null)
const moved = ref(false)
const fitNonce = ref(0)

// Only listings with coordinates can get a pin. The cap keeps a mix of kinds (round-robin, rank order kept).
const pinnable = computed(() => results.value.filter((r) => Number.isFinite(r.listing.lat) && Number.isFinite(r.listing.lng)))
const inArea = computed(() => {
  const b = searched.value
  if (!b) return pinnable.value
  return pinnable.value.filter(({ listing: l }) => l.lat >= b.south && l.lat <= b.north && l.lng >= b.west && l.lng <= b.east)
})
const pinned = computed(() => capByKind(inArea.value, MAP_PIN_LIMIT))
const unlocated = computed(() => results.value.length - pinnable.value.length)
// The map refits when the set of results changes (or the map is shown again), not when the list is re-searched.
const fitKey = computed(() => `${fitNonce.value}|${pinnable.value.map((r) => r.listing.id).sort().join(',')}`)
// Right after a fit the list follows whatever the map settles on; once a person moves it, only "Search this area" does.
let settling = true
let settleTimer = setTimeout(() => { settling = false }, 2000)
function refit() {
  searched.value = null
  moved.value = false
  settling = true
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => { settling = false }, 2000)
}
watch(fitKey, refit)
onBeforeUnmount(() => clearTimeout(settleTimer))
watch(view, async (v) => {
  if (v !== 'map') return
  await nextTick()
  mapRef.value?.invalidate()
  fitNonce.value++
})
// Counts agree with the results line and the list: pins are capped, and the list shows exactly the pins.
const mapCaption = computed(() => {
  const parts = []
  if (pinned.value.length < inArea.value.length) {
    parts.push(searched.value ? `Map shows ${pinned.value.length} of ${inArea.value.length} in this area.` : `Map shows ${pinned.value.length} of ${results.value.length}.`)
    parts.push(searched.value ? 'Zoom in or filter by type to see the rest.' : 'Filter by area or type to narrow it down.')
  }
  if (unlocated.value) parts.push(`${unlocated.value} without a map location ${unlocated.value === 1 ? 'is' : 'are'} in Cards.`)
  return parts.join(' ')
})
const areaLine = computed(() => {
  const n = inArea.value.length
  const shown = pinned.value.length
  return shown < n ? `Top ${shown} of ${n} in this area` : `${n} in this area`
})
const shownCards = computed(() => results.value.slice(0, visibleCards.value))

const markers = computed(() =>
  pinned.value.map((r, i) => ({
    id: r.listing.id,
    lat: r.listing.lat,
    lng: r.listing.lng,
    title: r.listing.title,
    label: '',
    tone: { place: 'teal', event: 'plum', deal: 'mustard', hangout: 'tomato' }[r.listing.type],
    icon: listingIcon(r.listing),
    pill: pinLabel(r.listing),
    active: selectedId.value === r.listing.id,
    fit: i < FIT_TOP,
  })),
)

const selected = computed(() => results.value.find((r) => r.listing.id === selectedId.value) || null)
// The side list starts short; every pin stays on the map. A new search starts it short again.
const RAIL_PAGE = 12
const railLimit = ref(RAIL_PAGE)
const railRows = computed(() => pinned.value.slice(0, railLimit.value))
watch(pinned, () => { railLimit.value = RAIL_PAGE })
watch(results, () => { if (selectedId.value && !selected.value) selectedId.value = null })
function select(id) {
  // A pin picked on the map opens its row too, even when it sits below the short list.
  const index = pinned.value.findIndex((r) => r.listing.id === id)
  if (index >= railLimit.value) railLimit.value = index + 1
  selectedId.value = id
  // Keep the pin clear of the docked card (about 150 px tall).
  mapRef.value?.reveal(id, { bottomInset: 170 })
}
function closePreview() { selectedId.value = null }
function onKey(e) {
  if (e.key === 'Escape' && selectedId.value && !detail.value && !adding.value && view.value === 'map') closePreview()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Hovering a pin lights its row too; bring that row into the visible part of the list.
function onPinHover(id) {
  hoverId.value = id
  if (id) document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'nearest' })
}
function onView({ bounds, user: byUser }) {
  if (view.value !== 'map') return
  if (byUser) {
    settling = false
    moved.value = true
  } else if (settling) searched.value = bounds
}
function searchHere() {
  const b = mapRef.value?.getBounds()
  if (!b) return
  settling = false
  searched.value = b
  moved.value = false
}

/* Area shortcuts and Near me only move the map; the list follows once the map has landed. */
const SHORTCUTS = ['bugis', 'orchard', 'chinatown', 'marina-bay'].map((slug) => AREAS.find((a) => a.slug === slug)).filter(Boolean)
const geoNote = ref('')
let geoTimer = null
function say(text) {
  geoNote.value = text
  clearTimeout(geoTimer)
  geoTimer = setTimeout(() => { geoNote.value = '' }, 7000)
}
async function flyToArea(a) {
  await mapRef.value?.flyTo(a.lat, a.lng, 15)
  searchHere()
}
const locating = ref(false)
function nearMe() {
  if (!navigator.geolocation) { say('This browser cannot share your location. Pick an area instead.'); return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    locating.value = false
    // The coordinates only steer the map; they are not stored or sent anywhere.
    if (coords.latitude < 1.14 || coords.latitude > 1.5 || coords.longitude < 103.5 || coords.longitude > 104.1) { say('You seem to be outside Singapore. Pick an area instead.'); return }
    await mapRef.value?.flyTo(coords.latitude, coords.longitude, 15)
    searchHere()
  }, (err) => {
    locating.value = false
    say(err.code === 1 ? 'Location is switched off for this site. Pick an area instead.' : 'Could not find your location. Pick an area instead.')
  }, { timeout: 8000, maximumAge: 60000 })
}
onBeforeUnmount(() => clearTimeout(geoTimer))

function toggleInterest(slug) {
  picked.value = picked.value.includes(slug) ? picked.value.filter((s) => s !== slug) : [...picked.value, slug]
}
function clearFilters() {
  q.value = ''
  if (!hangoutView.value) type.value = 'all'
  picked.value = []
  area.value = ''
  when.value = 'any'
}
const filtered = computed(() => q.value || (type.value !== 'all' && !hangoutView.value) || picked.value.length || area.value || when.value !== 'any')

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
      <template v-if="hangoutView">
        <div class="head-row">
          <div>
            <h1>Open Jios</h1>
            <p>Public hangouts with spots left. Have a look, then join if it suits you.</p>
          </div>
          <RouterLink to="/new?mode=public" class="btn btn-primary">Host an Open Jio</RouterLink>
        </div>
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
        <label class="visually-hidden" for="when-f">When</label>
        <select id="when-f" v-model="when" class="form-select when-select" :class="{ on: when !== 'any' }">
          <option v-for="t in whenChips" :key="t.key" :value="t.key">{{ t.label }}</option>
          <optgroup v-if="duringOptions.length" label="During a plan">
            <option v-for="t in duringOptions" :key="t.key" :value="t.key">{{ t.label }}</option>
          </optgroup>
        </select>
        <div v-if="!hangoutView" class="chip-row" role="group" aria-label="Type">
          <button v-for="t in types" :key="t.key" type="button" class="chip" :aria-pressed="type === t.key" @click="toggleType(t.key)">{{ t.label }}</button>
        </div>
        <button type="button" class="btn btn-secondary filter-toggle" :aria-expanded="filtersOpen" aria-controls="interest-filters" @click="filtersOpen = !filtersOpen">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          Filters <span v-if="filterCount" class="filter-count">{{ filterCount }}</span>
        </button>
      </div>
      <RouterLink v-if="hangoutView" to="/discover" class="back-link small fw-bold">Browse all of Discover</RouterLink>
      <section v-if="filtersOpen" id="interest-filters" class="interest-filters" aria-label="More filters">
        <div class="filter-heading"><h2 class="h6 m-0">What are you in the mood for?</h2><button v-if="picked.length" type="button" class="btn btn-ghost btn-sm" @click="picked = []">Reset tags</button></div>
        <div class="chip-row" role="group" aria-label="Interests">
          <button v-for="i in INTERESTS" :key="i.slug" type="button" class="chip" :aria-pressed="picked.includes(i.slug)" @click="toggleInterest(i.slug)"><CategoryIcon :name="i.slug" :size="16" />{{ i.label }}</button>
        </div>
        <div class="area-pick">
          <label for="area-f" class="form-label">Area</label>
          <select id="area-f" v-model="area" class="form-select">
            <option value="">Anywhere</option>
            <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
          </select>
        </div>
        <label v-if="user" class="personalise"><input v-model="forYou" type="checkbox" class="form-check-input" /> Use my interests to rank results</label>
      </section>
      <div v-else-if="picked.length || area" class="active-filters" aria-label="Selected filters">
        <span class="small muted">Filtered by</span>
        <button v-if="area" type="button" class="chip" :aria-label="`Remove ${areaLabel(area)} area filter`" @click="area = ''">{{ areaLabel(area) }} <span aria-hidden="true">×</span></button>
        <button v-for="tag in picked" :key="tag" type="button" class="chip" :aria-label="`Remove ${interestLabel(tag)} filter`" @click="toggleInterest(tag)">{{ interestLabel(tag) }} <span aria-hidden="true">×</span></button>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center my-3 gap-2 flex-wrap">
      <p class="m-0 small muted" role="status">
        {{ results.length }} {{ results.length === 1 ? 'result' : 'results' }}<template v-if="timeWindow"> that fit {{ windowText }}</template><template v-if="nearHome"> near {{ nearHome.label }}, your home area</template>
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
        <template v-else>
          <ul class="cards">
            <li v-for="r in shownCards" :id="`card-${r.listing.id}`" :key="r.listing.id" @mouseenter="active = r.listing.id">
              <ListingCard :listing="r.listing" :km="near ? r.km : null" :available="r.available" :active="active === r.listing.id" @add="onAdd" @open="detail = $event" />
            </li>
          </ul>
          <div v-if="results.length > visibleCards" class="show-more">
            <p class="small muted m-0">Showing {{ shownCards.length }} of {{ results.length }}</p>
            <button type="button" class="btn btn-secondary" @click="visibleCards += CARD_PAGE">Show more</button>
          </div>
        </template>
      </div>
      <div class="map-col" v-show="view === 'map'">
        <div class="map-layout" data-tour="discover-map">
          <aside class="rail" aria-label="Results in this area">
            <p class="rail-head" aria-live="polite"><strong>{{ areaLine }}</strong> · best match first</p>
            <div v-if="pinned.length" class="rail-scroll">
            <ul class="rail-list">
              <ResultRow
                v-for="r in railRows" :key="r.listing.id" :listing="r.listing" :km="near ? r.km : null"
                :hot="hoverId === r.listing.id" :selected="selectedId === r.listing.id"
                @select="select" @hover="hoverId = $event"
              />
            </ul>
            <button v-if="pinned.length > railLimit" type="button" class="rail-more" @click="railLimit = pinned.length">Show {{ pinned.length - railLimit }} more</button>
            </div>
            <p v-else class="rail-empty small muted">Nothing here. Pan the map and press Search this area, or clear a filter.</p>
          </aside>
          <div class="stage">
            <MapView
              ref="mapRef" :markers="markers" cluster pills scroll-wheel-zoom height="100%" :fit-key="fitKey"
              :highlight-id="hoverId" @select="select" @hover="onPinHover" @view="onView"
            />
            <div class="map-chips" role="group" aria-label="Jump to an area">
              <button v-for="a in SHORTCUTS" :key="a.slug" type="button" class="map-chip" @click="flyToArea(a)">{{ a.label }}</button>
              <button type="button" class="map-chip near-me" :disabled="locating" @click="nearMe">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                {{ locating ? 'Finding you…' : 'Near me' }}
              </button>
            </div>
            <p v-if="geoNote" class="geo-note small" role="status">{{ geoNote }}</p>
            <button v-if="moved" type="button" class="search-area" @click="searchHere"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>Search this area</button>
            <div v-if="selected" class="preview-dock">
              <PreviewCard :listing="selected.listing" @close="closePreview" @details="detail = $event" @add="onAdd" />
            </div>
          </div>
        </div>
        <div class="legend small">
          <span><i class="dot teal"></i>Place</span><span><i class="dot plum"></i>Event</span><span><i class="dot mustard"></i>Deal</span><span><i class="dot tomato"></i>Open Jio</span>
        </div>
        <p v-if="mapCaption" class="small muted map-cap">{{ mapCaption }}</p>
      </div>
    </div>

    <p class="small muted mt-4">Sources: OpenJio sample data (curated for this demo). Deals and events come from public posts on the Singapore Telegram channels @sgfooddeals, @sgweekend, @sgconcerts, @dateideas and @sgstudentpromos, and from confirmgood.com. They are read automatically, and each card links to its post. Map tiles from OneMap, Singapore Land Authority.</p>

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
.filters { padding: 12px 14px; }
.f-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.search { position: relative; flex: 1 1 220px; max-width: 380px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-2); }
.search .form-control { padding-left: 38px; }
.f-row .chip-row { gap: 6px; }
.f-row .chip { min-height: 34px; padding: 0.25rem 0.7rem; font-size: 0.88rem; }
.when-select { width: auto; max-width: 220px; min-height: 34px; padding-top: 0.2rem; padding-bottom: 0.2rem; border-radius: 999px; font-size: 0.88rem; font-weight: 600; }
.when-select.on { background-color: var(--tomato-soft); color: var(--tomato-ink); border-color: color-mix(in srgb, var(--tomato) 55%, transparent); }
.filter-toggle { flex: 0 0 auto; margin-left: auto; }
.filter-count { display: inline-grid; place-items: center; min-width: 23px; height: 23px; background: var(--tomato-soft); color: var(--tomato-ink); border-radius: 50%; }
.back-link { display: inline-block; margin-top: 10px; }
.head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
.head-row p { margin-bottom: 0; }
.interest-filters { border-top: 1px solid var(--line); padding-top: 14px; margin-top: 14px; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 10px; }
.area-pick { margin-top: 14px; max-width: 280px; }
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

/* Map with its list: side by side from 992 px, map only below that. */
.map-layout { display: grid; grid-template-columns: minmax(0, 1fr); }
.rail { display: none; }
.stage { position: relative; height: clamp(400px, 66vh, 720px); min-width: 0; }
.map-chips { position: absolute; z-index: 500; top: 10px; left: 54px; right: 10px; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
.map-chips::-webkit-scrollbar { display: none; }
.map-chip {
  flex: none; display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 12px;
  border: 1px solid var(--line-strong); border-radius: 999px; background: var(--card); color: var(--ink);
  font-size: 0.85rem; font-weight: 700; box-shadow: 0 1px 4px rgba(var(--oj-shadow-rgb), 0.18); cursor: pointer;
}
.map-chip:hover { border-color: var(--ink); }
.map-chip:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 2px; }
.map-chip:disabled { opacity: 0.7; cursor: progress; }
.geo-note { position: absolute; z-index: 500; top: 52px; left: 54px; max-width: min(360px, calc(100% - 70px)); margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--card); color: var(--ink); border: 1px solid var(--line-strong); box-shadow: var(--shadow-pop); }
/* A quiet floating pill, as in map apps: it offers a refresh; it is not the page's main action. */
.search-area { position: absolute; z-index: 500; top: 54px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--card); color: var(--ink); font-size: 0.85rem; font-weight: 700; box-shadow: var(--shadow-pop); white-space: nowrap; cursor: pointer; }
.search-area:hover { border-color: var(--ink); }
.search-area:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 2px; }
.preview-dock { position: absolute; z-index: 500; left: 12px; right: 12px; bottom: 28px; max-width: 460px; container: preview / inline-size; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; color: var(--ink-2); }
.map-cap { margin: 6px 0 0; }
.show-more { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
.dot.teal { background: var(--teal); } .dot.plum { background: var(--plum); } .dot.mustard { background: var(--mustard); } .dot.tomato { background: var(--tomato); }
.pick { display: flex; align-items: flex-start; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; cursor: pointer; background: var(--card); }
.pick.on { border-color: var(--tomato); background: var(--tomato-soft); }
@media (max-width: 575.98px) { .filter-toggle { flex: 1; margin-left: 0; } .seg { width: 100%; } .seg button { flex: 1; } .search { max-width: none; } .f-row { gap: 10px; } }
@media (min-width: 576px) { .cards-mode .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 992px) {
  .cards-mode .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .map-layout { grid-template-columns: 300px minmax(0, 1fr); gap: 16px; height: clamp(480px, calc(100vh - 340px), 780px); }
  .stage { height: 100%; }
  .rail { display: flex; flex-direction: column; min-height: 0; }
  .rail-head { margin: 0 0 8px; font-size: 0.88rem; color: var(--ink-2); }
  .rail-head strong { color: var(--ink); }
  .rail-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 4px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-lg); }
  .rail-list { list-style: none; margin: 0; padding: 0; }
  .rail-list > li + li { border-top: 1px solid var(--line); }
  .rail-more { display: block; width: 100%; margin-top: 4px; padding: 10px; border: 0; border-top: 1px solid var(--line); background: none; color: var(--tomato-ink); font-weight: 700; font-size: 0.88rem; cursor: pointer; }
  .rail-more:hover { background: var(--paper-2); }
  .rail-more:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: -3px; }
  .rail-empty { padding: 12px; border: 1px dashed var(--line-strong); border-radius: 14px; }
}
</style>

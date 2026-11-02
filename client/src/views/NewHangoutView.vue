<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createHangout, getHangout, currentUser, AREAS } from '../api/index.js'
import InterestPicker from '../components/InterestPicker.vue'
import JioSlip from '../components/brand/JioSlip.vue'
import SparkDoodle from '../components/brand/SparkDoodle.vue'
import { interestLabel } from '../lib/labels.js'
import { fmtDateKey } from '../lib/time.js'
import { toast } from '../lib/toast.js'
import { sgDateKey, sgParts, fromDateKey, DAY, MIN } from '../lib/time.js'
import { toastError } from '../lib/toast.js'
import { searchPlaces } from '../lib/places.js'
import { geocode } from '../lib/travel.js'
import { useUnsavedChanges } from '../composables/useUnsavedChanges.js'

const route = useRoute()
const router = useRouter()
const user = currentUser()

const modes = [
  { key: 'group', label: 'With friends', hint: 'Everyone marks when they are free, then you pick the best time.' },
  { key: 'solo', label: 'Just me', hint: 'Choose your free time and get a plan from your own interests.' },
  { key: 'public', label: 'Open Jio', hint: 'Set the time yourself. Anyone can find it in Discover and join.' },
]
// Vibe shortcuts fill in interests; people can still fine-tune the chips below.
const VIBES = [
  { key: 'makan', label: 'Makan', interests: ['food', 'markets'] },
  { key: 'chill', label: 'Chill', interests: ['cafes', 'wellness'] },
  { key: 'active', label: 'Active', interests: ['outdoors', 'games'] },
  { key: 'arts', label: 'Arts', interests: ['arts', 'museums'] },
  { key: 'night', label: 'Night out', interests: ['nightlife', 'music'] },
  { key: 'surprise', label: 'Surprise me', interests: [] },
]
const vibe = ref(null)
function pickVibe(v) {
  vibe.value = v.key
  form.value.interests = [...v.interests]
}
const STEPS = [
  { key: 'what', label: 'Plan' },
  { key: 'when', label: 'When' },
  { key: 'where', label: 'Where' },
  { key: 'review', label: 'Check' },
]
const step = ref(0)
const created = ref(null)
const stepHeading = ref(null)
const mode = ref(modes.some((m) => m.key === route.query.mode) ? route.query.mode : 'group')
watch(() => route.query.mode, (m) => { if (modes.some((x) => x.key === m)) mode.value = m })

// Default dates: the coming weekend.
const today = Date.now()
const w = sgParts(today).weekday
const toFri = (5 - w + 7) % 7 || 7
const fri = sgDateKey(today + toFri * DAY)
const sun = sgDateKey(fromDateKey(fri) + 2 * DAY)
const sat = sgDateKey(fromDateKey(fri) + DAY)

const form = ref({
  title: '',
  dateFrom: fri,
  dateTo: sun,
  day: sat,
  startTime: '14:00',
  endTime: '19:00',
  area: user?.homeArea && mode.value === 'solo' ? user.homeArea : 'city-hall',
  // A searched place; when set it wins over `area` (sent as `startArea`).
  startArea: null,
  interests: [],
  mealWanted: true,
  capacity: 6,
  description: '',
})
// "Jio again" (?again=<id>): start from a past hangout's name, vibe and start point. People are not
// carried over; the new invite link goes to the group as usual.
const again = ref(null)
const againId = typeof route.query.again === 'string' ? route.query.again : ''
if (againId) {
  getHangout(againId).then(({ hangout: h }) => {
    // Leave anything the user already typed or picked while this loaded.
    if (form.value.title || form.value.interests.length) return
    again.value = h
    form.value.title = `${h.title} again`.slice(0, 60)
    form.value.interests = [...(h.interests || [])]
    vibe.value = VIBES.find((v) => v.interests.length === form.value.interests.length && v.interests.every((i) => form.value.interests.includes(i)))?.key || null
    const sa = h.startArea
    if (sa && AREAS.some((a) => a.slug === sa.slug)) {
      form.value.area = sa.slug
      form.value.startArea = null
    } else if (sa) {
      form.value.area = null
      form.value.startArea = { label: sa.label, lat: sa.lat, lng: sa.lng }
      query.value = sa.label
    }
    originalForm = JSON.stringify(form.value)
  }).catch(() => { /* an unreadable hangout just means a blank form */ })
}
const submitting = ref(false)
// Set once the plan exists, so the redirect to it is not mistaken for abandoning unsaved work.
const saved = ref(false)
const errors = ref({})
let originalForm = JSON.stringify(form.value)
useUnsavedChanges(() => !saved.value && !submitting.value && JSON.stringify(form.value) !== originalForm, 'Leave without saving this new plan?')
const minDate = sgDateKey(today)

const placeholder = computed(() => ({ group: 'Friday makan…', solo: 'Free afternoon…', public: 'Sunday hawker crawl…' })[mode.value])

function validate(upTo = STEPS.length - 1) {
  const e = {}
  const f = form.value
  if (!f.title.trim()) e.title = 'Give it a name so people recognise it.'
  if (upTo < 1) {
    errors.value = e
    return !Object.keys(e).length
  }
  if (mode.value === 'group') {
    if (!f.dateFrom || !f.dateTo) e.dates = 'Choose both dates.'
    else if (f.dateTo < f.dateFrom) e.dates = 'The end date is before the start date.'
    else if ((fromDateKey(f.dateTo) - fromDateKey(f.dateFrom)) / DAY > 6) e.dates = 'Keep the range to 7 days or fewer.'
  } else {
    if (!f.day) e.time = 'Choose a day.'
    else if (f.endTime <= f.startTime) e.time = 'The end time must be after the start time.'
    else {
      const [sh, sm] = f.startTime.split(':').map(Number)
      const [eh, em] = f.endTime.split(':').map(Number)
      if ((eh * 60 + em) - (sh * 60 + sm) < 60) e.time = 'Leave at least an hour.'
    }
  }
  errors.value = e
  return !Object.keys(e).length
}

function focusInvalid() {
  requestAnimationFrame(() => document.querySelector('.is-invalid')?.focus())
}
function focusStep() {
  requestAnimationFrame(() => stepHeading.value?.focus())
}
function next() {
  if (!validate(step.value)) return focusInvalid()
  step.value = Math.min(step.value + 1, STEPS.length - 1)
  focusStep()
}
function back() {
  step.value = Math.max(0, step.value - 1)
  focusStep()
}
function goTo(i) {
  if (i < step.value) {
    step.value = i
    focusStep()
  }
}
const areaName = computed(() => form.value.startArea?.label || AREAS.find((a) => a.slug === form.value.area)?.label || '')

// Start point: pick a popular area, or search any place, station, address or postal code.
const SEARCH_DOWN = "Search isn't available right now. Pick a popular area instead."
const query = ref(''), results = ref([]), searching = ref(false), searchError = ref(''), active = ref(-1), listOpen = ref(false)
let timer, controller, sequence = 0
function pickArea(slug) {
  form.value.area = slug
  form.value.startArea = null
  query.value = ''
  closeList()
}
function pickPlace(p) {
  const label = (p.name || p.address || '').trim().slice(0, 80)
  if (!label) return
  form.value.area = null
  form.value.startArea = { label, lat: Number(p.lat), lng: Number(p.lng) }
  query.value = label
  closeList()
}
function closeList() {
  clearTimeout(timer); controller?.abort(); ++sequence
  results.value = []; searching.value = false; searchError.value = ''; active.value = -1; listOpen.value = false
}
function onQuery() {
  // Typing again drops a previously chosen place until a new one is picked.
  if (form.value.startArea && query.value !== form.value.startArea.label) {
    form.value.startArea = null
    form.value.area = 'city-hall'
  }
  clearTimeout(timer); controller?.abort(); ++sequence
  results.value = []; searchError.value = ''; active.value = -1
  const q = query.value.trim()
  if (q.length < 3 || form.value.startArea) { searching.value = false; listOpen.value = false; return }
  searching.value = true; listOpen.value = true
  timer = setTimeout(runSearch, 400)
}
async function runSearch() {
  const q = query.value.trim()
  controller = new AbortController()
  const { signal } = controller, ticket = ++sequence
  // Named places come from Geoapify; anything with a digit (address, postal code) also tries OneMap.
  const jobs = [searchPlaces(q, signal)]
  if (/\d/.test(q)) jobs.push(geocode(q))
  const settled = await Promise.allSettled(jobs)
  if (ticket !== sequence || signal.aborted) return
  const found = []
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue
    for (const p of r.value) {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) continue
      const name = p.name || p.address
      const address = p.name ? p.address : ''
      if (name && !found.some((x) => x.name === name && x.address === address)) found.push({ id: p.id || `${p.lat},${p.lng}`, name, address, lat: p.lat, lng: p.lng })
    }
  }
  results.value = found.slice(0, 6)
  searchError.value = !found.length && settled.every((r) => r.status === 'rejected') ? SEARCH_DOWN : ''
  searching.value = false
}
function onKey(e) {
  if (e.key === 'ArrowDown' && results.value.length) { e.preventDefault(); active.value = (active.value + 1) % results.value.length }
  else if (e.key === 'ArrowUp' && results.value.length) { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length }
  else if (e.key === 'Enter') {
    // Enter picks a result here instead of submitting the whole form.
    e.preventDefault()
    const p = results.value[active.value >= 0 ? active.value : 0]
    if (p) pickPlace(p)
  } else if (e.key === 'Escape' && listOpen.value) { e.stopPropagation(); closeList() }
}
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort(); ++sequence })

// Time inputs step in 5 minutes; a typed value snaps to the nearest 5.
function snapTime(key) {
  const m = /^(\d{2}):(\d{2})/.exec(form.value[key] || '')
  if (!m) return
  const total = Math.min(23 * 60 + 55, Math.round((Number(m[1]) * 60 + Number(m[2])) / 5) * 5)
  form.value[key] = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const whenText = computed(() => {
  const f = form.value
  if (mode.value === 'group') return f.dateFrom === f.dateTo ? fmtDateKey(f.dateFrom) : `${fmtDateKey(f.dateFrom)} to ${fmtDateKey(f.dateTo)}`
  return `${fmtDateKey(f.day)}, ${f.startTime} to ${f.endTime}`
})
const inviteLink = computed(() => (created.value ? `${window.location.origin}/j/${created.value.inviteToken}` : ''))
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    toast('Invite link copied')
  } catch {
    toast('Select the link and copy it yourself')
  }
}
async function shareLink() {
  try {
    await navigator.share({ title: created.value.title, text: `${created.value.title}: mark when you're free`, url: inviteLink.value })
  } catch {
    /* dismissed */
  }
}

async function submit() {
  if (step.value < STEPS.length - 1) return next()
  if (!validate()) {
    const firstBad = errors.value.title ? 0 : 1
    step.value = firstBad
    return focusInvalid()
  }
  submitting.value = true
  try {
    const f = form.value
    const base = fromDateKey(f.day)
    const at = (t) => {
      const [h, m] = t.split(':').map(Number)
      return base + (h * 60 + m) * MIN
    }
    const h = await createHangout({
      title: f.title,
      mode: mode.value === 'solo' ? 'solo' : 'group',
      visibility: mode.value === 'public' ? 'public' : 'private',
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      slotStart: at(f.startTime),
      slotEnd: at(f.endTime),
      area: f.startArea ? null : f.area,
      startArea: f.startArea || undefined,
      interests: f.interests,
      mealWanted: f.mealWanted,
      capacity: f.capacity,
      description: f.description,
    })
    saved.value = true
    if (mode.value === 'group') {
      created.value = h
      focusStep()
    } else {
      router.push({ path: `/h/${h.id}`, query: { created: '1' } })
    }
  } catch (e) {
    toastError(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page page-narrow">
    <template v-if="created">
      <header class="page-head done-head">
        <h1 ref="stepHeading" tabindex="-1">Steady lah, it's on.</h1>
        <SparkDoodle class="spark" :size="44" />
        <p>Send this to the group chat. Everyone marks when they are free, then you lock the best time.</p>
      </header>
      <JioSlip label="INVITED" rise>
        <h2 class="slip-title">{{ created.title }}</h2>
        <dl class="slip-facts">
          <div><dt>When</dt><dd class="tnum">{{ whenText }}</dd></div>
          <div><dt>Start</dt><dd>Around {{ areaName }}</dd></div>
          <div v-if="created.interests.length"><dt>Vibe</dt><dd>{{ created.interests.map(interestLabel).join(', ') }}</dd></div>
        </dl>
        <template #stub>
          <label for="invite-link" class="form-label">Invite link</label>
          <div class="link-row">
            <input id="invite-link" class="form-control" :value="inviteLink" readonly @focus="$event.target.select()" />
            <button type="button" class="btn btn-secondary" @click="copyLink">Copy link</button>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button v-if="canShare" type="button" class="btn btn-secondary" @click="shareLink">Share</button>
            <RouterLink :to="{ path: `/h/${created.id}`, query: { created: '1' } }" class="btn btn-primary ms-auto">Go to jio</RouterLink>
          </div>
        </template>
      </JioSlip>
    </template>

    <template v-else>
      <header class="page-head">
        <h1>{{ mode === 'solo' ? 'Plan for me' : mode === 'public' ? 'Host an Open Jio' : 'Create a jio' }}</h1>
        <p>{{ modes.find((m) => m.key === mode).hint }}</p>
      </header>

      <ol class="wizard" aria-label="Steps">
        <li v-for="(s, i) in STEPS" :key="s.key" :class="{ done: i < step, current: i === step }" :aria-current="i === step ? 'step' : undefined">
          <button type="button" class="w-btn" :disabled="i >= step" @click="goTo(i)">
            <span class="w-dot tnum" aria-hidden="true">{{ i + 1 }}</span>
            <span class="w-lbl">{{ s.label }}</span>
          </button>
        </li>
      </ol>

      <form data-tour="create-form" class="card-x form-card" novalidate @submit.prevent="submit">
        <Transition name="oj-step" mode="out-in">
          <div v-if="step === 0" key="what">
            <h2 ref="stepHeading" tabindex="-1" class="step-title">What's the plan?</h2>
            <fieldset class="mb-4">
              <legend class="form-label">Who is it for?</legend>
              <div class="modes" role="radiogroup">
                <label v-for="m in modes" :key="m.key" class="mode" :class="{ on: mode === m.key }">
                  <input v-model="mode" type="radio" name="mode" :value="m.key" class="visually-hidden" />
                  <span class="m-title">{{ m.label }}</span>
                </label>
              </div>
            </fieldset>

            <p v-if="again && mode === 'group'" class="again-hint small" role="note">Send the new invite link to the same group.</p>
            <div class="mb-4">
              <label for="title" class="form-label">Name</label>
              <input id="title" v-model="form.title" class="form-control" :class="{ 'is-invalid': errors.title }" :placeholder="placeholder" maxlength="60" autocomplete="off" :aria-describedby="errors.title ? 'title-err' : undefined" />
              <div v-if="errors.title" id="title-err" class="invalid-feedback d-block">{{ errors.title }}</div>
            </div>

            <fieldset class="mb-2">
              <legend class="form-label">Vibe <span class="muted fw-normal">(optional)</span></legend>
              <div class="chip-row mb-3">
                <button v-for="v in VIBES" :key="v.key" type="button" class="chip vibe" :aria-pressed="vibe === v.key" @click="pickVibe(v)">{{ v.label }}</button>
              </div>
              <details class="fine" :open="form.interests.length > 0 && vibe === null">
                <summary>Fine-tune interests</summary>
                <div class="pt-2">
                  <InterestPicker v-model="form.interests" :max="5" label="Vibe" />
                  <div class="form-text">Up to 5. Gives everyone's own interests a nudge in this direction.</div>
                </div>
              </details>
            </fieldset>
          </div>

          <div v-else-if="step === 1" key="when">
            <h2 ref="stepHeading" tabindex="-1" class="step-title">When?</h2>
            <div v-if="mode === 'group'" class="mb-2">
              <span class="form-label d-block" id="dates-label">Which days could work?</span>
              <div class="row g-2" role="group" aria-labelledby="dates-label">
                <div class="col-6">
                  <label for="from" class="small muted">From</label>
                  <input id="from" v-model="form.dateFrom" type="date" class="form-control" :class="{ 'is-invalid': errors.dates }" :min="minDate" />
                </div>
                <div class="col-6">
                  <label for="to" class="small muted">To</label>
                  <input id="to" v-model="form.dateTo" type="date" class="form-control" :class="{ 'is-invalid': errors.dates }" :min="form.dateFrom || minDate" />
                </div>
              </div>
              <div v-if="errors.dates" class="invalid-feedback d-block">{{ errors.dates }}</div>
              <div v-else class="form-text">Up to 7 days. Let's see who's free inside this range.</div>
            </div>

            <div v-else class="mb-2">
              <span class="form-label d-block" id="time-label">Pick the day and hours</span>
              <div class="row g-2" role="group" aria-labelledby="time-label">
                <div class="col-12 col-sm-5">
                  <label for="day" class="small muted">Day</label>
                  <input id="day" v-model="form.day" type="date" class="form-control" :class="{ 'is-invalid': errors.time }" :min="minDate" />
                </div>
                <div class="col-6 col-sm-3 offset-sm-1">
                  <label for="st" class="small muted">From</label>
                  <input id="st" v-model="form.startTime" type="time" step="300" class="form-control" :class="{ 'is-invalid': errors.time }" @change="snapTime('startTime')" />
                </div>
                <div class="col-6 col-sm-3">
                  <label for="et" class="small muted">Until</label>
                  <input id="et" v-model="form.endTime" type="time" step="300" class="form-control" :class="{ 'is-invalid': errors.time }" @change="snapTime('endTime')" />
                </div>
              </div>
              <div v-if="errors.time" class="invalid-feedback d-block">{{ errors.time }}</div>
            </div>
          </div>

          <div v-else-if="step === 2" key="where">
            <h2 ref="stepHeading" tabindex="-1" class="step-title">Where to start?</h2>
            <div class="mb-4">
              <label for="start" class="form-label">Start point</label>
              <div class="start-search">
                <input
                  id="start"
                  v-model="query"
                  class="form-control"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="start-results"
                  :aria-expanded="listOpen && results.length > 0"
                  :aria-activedescendant="active >= 0 ? `start-opt-${active}` : undefined"
                  aria-describedby="start-help"
                  placeholder="Tampines, Jewel, 238801…"
                  autocomplete="off"
                  maxlength="100"
                  @input="onQuery"
                  @keydown="onKey"
                />
                <ul v-if="listOpen && results.length" id="start-results" class="start-results" role="listbox" aria-label="Start point matches">
                  <li v-for="(p, i) in results" :id="`start-opt-${i}`" :key="p.id + i" role="option" :aria-selected="i === active" class="start-opt" :class="{ on: i === active }" @mousedown.prevent="pickPlace(p)">
                    <strong>{{ p.name }}</strong><span v-if="p.address" class="small muted">{{ p.address }}</span>
                  </li>
                </ul>
              </div>
              <p id="start-help" class="form-text mb-0">Search any place, MRT station, address or postal code, or pick a popular area.</p>
              <p v-if="searching" class="form-text mb-0" role="status">Looking up places…</p>
              <p v-else-if="searchError" class="form-text text-danger mb-0" role="alert">{{ searchError }}</p>
              <p v-else-if="listOpen && !results.length && query.trim().length >= 3" class="form-text mb-0" role="status">No matches. Try another name or pick a popular area.</p>
              <p v-else-if="form.startArea" class="form-text mb-0" role="status">Starting around {{ form.startArea.label }}.</p>

              <div id="areas-label" class="small-caps mt-3 mb-2">Popular areas</div>
              <div class="chip-row" role="group" aria-labelledby="areas-label">
                <button v-for="a in AREAS" :key="a.slug" type="button" class="chip" :aria-pressed="!form.startArea && form.area === a.slug" @click="pickArea(a.slug)">{{ a.label }}</button>
              </div>
              <div class="form-text mt-2">Somewhere easy for everyone to reach. Stops stay within a short trip of it.</div>
            </div>

            <div class="form-check form-switch mb-4">
              <input id="meal" v-model="form.mealWanted" class="form-check-input" type="checkbox" role="switch" />
              <label class="form-check-label" for="meal">Include a meal if the time spans lunch or dinner</label>
            </div>

            <div v-if="mode === 'public'" class="row g-3">
              <div class="col-sm-4">
                <label for="cap" class="form-label">Spots</label>
                <input id="cap" v-model.number="form.capacity" type="number" min="2" max="8" class="form-control tnum" />
                <div class="form-text">Including you. Max 8.</div>
              </div>
              <div class="col-sm-8">
                <label for="desc" class="form-label">Note for joiners <span class="muted fw-normal">(optional)</span></label>
                <input id="desc" v-model="form.description" class="form-control" maxlength="200" placeholder="Easy pace, come solo…" />
              </div>
            </div>
          </div>

          <div v-else key="review">
            <h2 ref="stepHeading" tabindex="-1" class="step-title">Looks right?</h2>
            <dl class="review">
              <div><dt>Name</dt><dd>{{ form.title }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(0)">Edit<span class="visually-hidden"> name</span></button></div>
              <div><dt>Type</dt><dd>{{ modes.find((m) => m.key === mode).label }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(0)">Edit<span class="visually-hidden"> type</span></button></div>
              <div><dt>When</dt><dd class="tnum">{{ whenText }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(1)">Edit<span class="visually-hidden"> time</span></button></div>
              <div><dt>Start</dt><dd>Around {{ areaName }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(2)">Edit<span class="visually-hidden"> area</span></button></div>
              <div><dt>Vibe</dt><dd>{{ form.interests.length ? form.interests.map(interestLabel).join(', ') : 'Anything goes' }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(0)">Edit<span class="visually-hidden"> vibe</span></button></div>
              <div v-if="mode === 'public'"><dt>Spots</dt><dd class="tnum">{{ form.capacity }}</dd><button type="button" class="btn btn-ghost btn-sm" @click="goTo(2)">Edit<span class="visually-hidden"> spots</span></button></div>
            </dl>
          </div>
        </Transition>

        <div class="actions">
          <RouterLink v-if="step === 0" to="/" class="btn btn-ghost">Cancel</RouterLink>
          <button v-else type="button" class="btn btn-ghost" @click="back">Back</button>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            <span v-if="submitting" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <template v-if="step < STEPS.length - 1">Next</template>
            <template v-else>{{ mode === 'group' ? 'Create and invite' : mode === 'solo' ? 'Create plan' : 'Create Open Jio' }}</template>
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.form-card { padding: 22px; overflow: hidden; }
.step-title { font-size: 1.35rem; margin: 0 0 18px; }
.step-title:focus { outline: none; }
.again-hint { margin: -8px 0 16px; padding: 8px 12px; border-radius: 12px; background: var(--teal-soft); color: var(--teal-ink); font-weight: 600; }
legend { font-size: 0.92rem; }
.wizard { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0 0 14px; }
.wizard li { flex: 1; }
.w-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 4px;
  background: none;
  border: 0;
  border-bottom: 3px solid var(--line);
  color: var(--ink-2);
  font-weight: 700;
  font-size: 0.88rem;
  transition: border-color var(--oj-t-standard) var(--ease), color var(--oj-t-quick);
}
.w-btn:disabled { cursor: default; opacity: 1; }
.w-dot {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--paper-2);
  font-size: 0.78rem;
}
.done .w-btn { border-color: var(--teal); color: var(--ink); cursor: pointer; }
.done .w-dot { background: var(--teal-soft); color: var(--teal-ink); }
.current .w-btn { border-color: var(--tomato); color: var(--ink); }
.current .w-dot { background: var(--tomato); color: var(--on-accent); }
.modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mode {
  display: grid;
  place-items: center;
  text-align: center;
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  cursor: pointer;
  background: var(--card);
  transition: background-color var(--oj-t-quick), border-color var(--oj-t-quick);
}
.mode:hover { background: var(--paper-2); }
.mode.on { border-color: var(--tomato); background: var(--tomato-soft); color: var(--tomato-ink); }
.mode:focus-within { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.m-title { font-weight: 700; font-size: 0.95rem; }
.start-search { position: relative; }
.start-results { position: absolute; z-index: 5; left: 0; right: 0; top: calc(100% + 4px); list-style: none; margin: 0; padding: 4px; display: grid; gap: 2px; background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow-pop); max-height: 280px; overflow-y: auto; }
.start-opt { display: grid; gap: 2px; padding: 8px 10px; min-height: 44px; border-radius: 10px; cursor: pointer; }
.start-opt:hover, .start-opt.on { background: var(--teal-soft); }
.start-opt strong { overflow-wrap: anywhere; }
.fine summary { cursor: pointer; font-weight: 600; font-size: 0.92rem; color: var(--ink-2); min-height: 32px; }
.review { margin: 0; display: grid; gap: 2px; }
.review > div { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.review dt { font-size: 0.85rem; color: var(--ink-2); font-weight: 700; }
.review dd { margin: 0; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.actions { display: flex; justify-content: space-between; gap: 8px; padding-top: 22px; }
.done-head { position: relative; }
.done-head h1:focus { outline: none; }
.done-head .spark { position: absolute; top: -18px; left: -20px; }
.slip-title { font-size: 1.5rem; margin: 0 0 12px; }
.slip-facts { margin: 0; display: grid; gap: 6px; }
.slip-facts > div { display: grid; grid-template-columns: 56px 1fr; gap: 10px; }
.slip-facts dt { font-size: 0.85rem; color: var(--ink-2); font-weight: 700; }
.slip-facts dd { margin: 0; font-weight: 600; }
.link-row { display: flex; gap: 8px; align-items: center; }
.link-row .btn { white-space: nowrap; flex: none; }
.link-row .form-control { min-width: 0; font-size: 0.9rem; }
@media (max-width: 420px) {
  .w-lbl { display: none; }
  .current .w-lbl { display: inline; }
}
</style>

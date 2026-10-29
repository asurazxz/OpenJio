<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createHangout, currentUser, AREAS } from '../api/index.js'
import InterestPicker from '../components/InterestPicker.vue'
import JioSlip from '../components/brand/JioSlip.vue'
import SparkDoodle from '../components/brand/SparkDoodle.vue'
import { interestLabel } from '../lib/labels.js'
import { fmtDateKey } from '../lib/time.js'
import { toast } from '../lib/toast.js'
import { sgDateKey, sgParts, fromDateKey, DAY, MIN } from '../lib/time.js'
import { toastError } from '../lib/toast.js'

const route = useRoute()
const router = useRouter()
const user = currentUser()

const modes = [
  { key: 'group', label: 'With friends', hint: 'Everyone marks when they are free, then you pick the best time.' },
  { key: 'solo', label: 'Just me', hint: 'Choose your free time and get a plan from your own interests.' },
  { key: 'public', label: 'Open jio', hint: 'Set the time yourself. Anyone can find it in Discover and join.' },
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
  interests: [],
  mealWanted: true,
  capacity: 6,
  description: '',
})
const submitting = ref(false)
const errors = ref({})
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
const areaName = computed(() => AREAS.find((a) => a.slug === form.value.area)?.label || '')
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
      area: f.area,
      interests: f.interests,
      mealWanted: f.mealWanted,
      capacity: f.capacity,
      description: f.description,
    })
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
        <h1>{{ mode === 'solo' ? 'Plan for me' : mode === 'public' ? 'Host an open jio' : 'Create a jio' }}</h1>
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

      <form class="card-x form-card" novalidate @submit.prevent="submit">
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
                  <input id="st" v-model="form.startTime" type="time" step="1800" class="form-control" :class="{ 'is-invalid': errors.time }" />
                </div>
                <div class="col-6 col-sm-3">
                  <label for="et" class="small muted">Until</label>
                  <input id="et" v-model="form.endTime" type="time" step="1800" class="form-control" :class="{ 'is-invalid': errors.time }" />
                </div>
              </div>
              <div v-if="errors.time" class="invalid-feedback d-block">{{ errors.time }}</div>
            </div>
          </div>

          <div v-else-if="step === 2" key="where">
            <h2 ref="stepHeading" tabindex="-1" class="step-title">Where to start?</h2>
            <div class="mb-4">
              <label for="area" class="form-label">Start area</label>
              <select id="area" v-model="form.area" class="form-select">
                <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
              </select>
              <div class="form-text">Somewhere easy for everyone to reach. Stops stay within a short trip of it.</div>
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
            <template v-else>{{ mode === 'group' ? 'Create and invite' : mode === 'solo' ? 'Create plan' : 'Create open jio' }}</template>
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

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createHangout, currentUser, AREAS } from '../api/index.js'
import InterestPicker from '../components/InterestPicker.vue'
import { sgDateKey, sgParts, fromDateKey, DAY, MIN } from '../lib/time.js'
import { toastError } from '../lib/toast.js'

const route = useRoute()
const router = useRouter()
const user = currentUser()

const modes = [
  { key: 'group', label: 'With friends', hint: 'Everyone shares when they are free, then you pick the best time.' },
  { key: 'solo', label: 'Just me', hint: 'Choose your free time and get a plan from your own interests.' },
  { key: 'public', label: 'Open jio', hint: 'Set the time yourself. Anyone can find it in Discover and join.' },
]
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

const placeholder = computed(() => ({ group: 'Saturday catch-up', solo: 'Free afternoon', public: 'Sunday hawker crawl' })[mode.value])

function validate() {
  const e = {}
  const f = form.value
  if (!f.title.trim()) e.title = 'Give it a name so people recognise it.'
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

async function submit() {
  if (!validate()) {
    const first = document.querySelector('.is-invalid')
    first?.focus()
    return
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
    router.push({ path: `/h/${h.id}`, query: { created: '1' } })
  } catch (e) {
    toastError(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page page-narrow">
    <header class="page-head">
      <h1>New plan</h1>
      <p>A few details and you are set. It takes under a minute.</p>
    </header>

    <form class="card-x pop form-card" novalidate @submit.prevent="submit">
      <fieldset class="mb-4">
        <legend class="form-label">What kind of plan?</legend>
        <div class="modes" role="radiogroup">
          <label v-for="m in modes" :key="m.key" class="mode" :class="{ on: mode === m.key }">
            <input v-model="mode" type="radio" name="mode" :value="m.key" class="visually-hidden" />
            <span class="m-title">{{ m.label }}</span>
            <span class="m-hint">{{ m.hint }}</span>
          </label>
        </div>
      </fieldset>

      <div class="mb-4">
        <label for="title" class="form-label">Name</label>
        <input id="title" v-model="form.title" class="form-control" :class="{ 'is-invalid': errors.title }" :placeholder="placeholder" maxlength="60" autocomplete="off" :aria-describedby="errors.title ? 'title-err' : undefined" />
        <div v-if="errors.title" id="title-err" class="invalid-feedback d-block">{{ errors.title }}</div>
      </div>

      <div v-if="mode === 'group'" class="mb-4">
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
        <div v-else class="form-text">Up to 7 days. Everyone marks when they are free inside this range.</div>
      </div>

      <div v-else class="mb-4">
        <span class="form-label d-block" id="time-label">When?</span>
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

      <div class="mb-4">
        <label for="area" class="form-label">Start area</label>
        <select id="area" v-model="form.area" class="form-select">
          <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
        </select>
        <div class="form-text">Plans start here. Choose somewhere easy for everyone to reach.</div>
      </div>

      <div class="mb-4">
        <span class="form-label d-block">Vibe <span class="muted fw-normal">(optional, up to 5)</span></span>
        <InterestPicker v-model="form.interests" :max="5" label="Vibe" />
        <div class="form-text">Gives everyone's own interests a nudge in this direction.</div>
      </div>

      <div class="form-check form-switch mb-4">
        <input id="meal" v-model="form.mealWanted" class="form-check-input" type="checkbox" role="switch" />
        <label class="form-check-label" for="meal">Include a meal if the time spans lunch or dinner</label>
      </div>

      <template v-if="mode === 'public'">
        <div class="row g-3 mb-4">
          <div class="col-sm-4">
            <label for="cap" class="form-label">Spots</label>
            <input id="cap" v-model.number="form.capacity" type="number" min="2" max="8" class="form-control" />
            <div class="form-text">Including you. Max 8.</div>
          </div>
          <div class="col-sm-8">
            <label for="desc" class="form-label">Note for joiners <span class="muted fw-normal">(optional)</span></label>
            <input id="desc" v-model="form.description" class="form-control" maxlength="200" placeholder="Easy pace, come solo" />
          </div>
        </div>
      </template>

      <div class="d-flex justify-content-end gap-2 pt-2">
        <RouterLink to="/" class="btn btn-ghost">Cancel</RouterLink>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ mode === 'group' ? 'Create and invite' : mode === 'solo' ? 'Create plan' : 'Create open jio' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-card { padding: 22px; }
legend { font-size: 0.92rem; }
.modes { display: grid; gap: 10px; }
.mode {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1.5px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: var(--paper);
}
.mode:hover { border-color: var(--ink-3); }
.mode.on { border-color: var(--line-strong); background: var(--mustard-soft); box-shadow: var(--shadow-pop); }
.mode:focus-within { outline: 3px solid var(--mustard); outline-offset: 2px; }
.m-title { font-weight: 700; }
.m-hint { font-size: 0.86rem; color: var(--ink-2); }
@media (min-width: 576px) {
  .modes { grid-template-columns: repeat(3, 1fr); }
}
</style>

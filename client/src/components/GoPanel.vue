<script setup>
import { ref, computed, onMounted } from 'vue'
import { getPlan, lateJoin, reopenVoting, setStage, AREAS, currentUser } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtTime, fmtDuration, fmtRange, sgDateKey, fromDateKey, MIN } from '../lib/time.js'
import { forecastNear } from '../lib/weather.js'
import { toast, toastError } from '../lib/toast.js'
import PlanTimeline from './PlanTimeline.vue'
import MapView from './MapView.vue'
import EmptyState from './EmptyState.vue'

const props = defineProps({ detail: { type: Object, required: true } })
const emit = defineEmits(['goto'])
const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const { data: plan } = useLive(() => getPlan(h.value.id))

const me = currentUser()
const originArea = ref(me?.homeArea || 'city-hall')
const geo = ref(null)
const geoError = ref('')
const slotDay = computed(() => (h.value.lockedSlot ? sgDateKey(h.value.lockedSlot.start) : null))
const defaultDepart = () => {
  if (!h.value.lockedSlot) return '18:00'
  const t = h.value.lockedSlot.start + 60 * MIN
  return fmtHHMM(t)
}
function fmtHHMM(ms) {
  const d = new Date(ms + 8 * 3600e3)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
const departTime = ref(defaultDepart())
const result = ref(null)
const checking = ref(false)

function useLocation() {
  geoError.value = ''
  if (!navigator.geolocation) {
    geoError.value = 'Location is not available in this browser.'
    return
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      geo.value = { lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location' }
    },
    () => {
      geoError.value = 'Could not get your location. Pick an area instead.'
    },
    { timeout: 8000, maximumAge: 60000 },
  )
}

async function check() {
  checking.value = true
  result.value = null
  try {
    const [hh, mm] = departTime.value.split(':').map(Number)
    const departMs = fromDateKey(slotDay.value) + (hh * 60 + mm) * MIN
    const from = geo.value || AREAS.find((a) => a.slug === originArea.value)
    result.value = await lateJoin(h.value.id, { from, departMs })
  } catch (e) {
    toastError(e)
  } finally {
    checking.value = false
  }
}

const weather = ref(null)
const weatherError = ref('')
onMounted(async () => {
  try {
    weather.value = await forecastNear(h.value.startArea)
  } catch (e) {
    weatherError.value = e.message
  }
})

const markers = computed(() => (plan.value?.stops || []).map((s, i) => ({ id: i, lat: s.listing.lat, lng: s.listing.lng, label: String(i + 1), title: s.listing.title, active: result.value?.best?.index === i })))

async function reopen() {
  if (!window.confirm('Reopen voting? Everyone will see the plan as not final until you confirm again.')) return
  try {
    await reopenVoting(h.value.id)
    emit('goto', 'plan')
  } catch (e) {
    toastError(e)
  }
}
async function end(stage) {
  const msg = stage === 'cancelled' ? 'Cancel this hangout for everyone?' : 'Mark this hangout as done?'
  if (!window.confirm(msg)) return
  try {
    await setStage(h.value.id, stage)
    toast(stage === 'cancelled' ? 'Hangout cancelled' : 'Marked as done')
  } catch (e) {
    toastError(e)
  }
}
</script>

<template>
  <div>
    <EmptyState v-if="h.stage !== 'final' && h.stage !== 'ended'" title="Not confirmed yet" body="Once the host confirms the plan, the final timeline and the late-join helper appear here." tone="teal">
      <button type="button" class="btn btn-secondary" @click="emit('goto', 'plan')">See the draft plan</button>
    </EmptyState>

    <div v-else-if="plan" class="row g-4">
      <div class="col-lg-7">
        <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-3">
          <h3 class="m-0">{{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}</h3>
          <span class="small muted">Times are the plan, not live locations.</span>
        </div>
        <PlanTimeline :stops="plan.stops" :start="h.startArea" :active-index="result?.best?.index ?? -1" />
        <div v-if="isHost && h.stage === 'final'" class="d-flex flex-wrap gap-2 mt-3">
          <button type="button" class="btn btn-secondary btn-sm" @click="reopen">Change the plan</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="end('ended')">Mark as done</button>
          <button type="button" class="btn btn-ghost btn-sm text-danger" @click="end('cancelled')">Cancel hangout</button>
        </div>
      </div>

      <aside class="col-lg-5">
        <div class="card-x pop join">
          <h3 class="m-0">Joining later?</h3>
          <p class="small muted">Tell us where you are leaving from and when. We find the first stop you can reach with time to spare.</p>
          <form class="row g-2" @submit.prevent="check">
            <div class="col-7">
              <label for="origin" class="small muted">Leaving from</label>
              <select id="origin" v-model="originArea" class="form-select" :disabled="!!geo">
                <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
              </select>
            </div>
            <div class="col-5">
              <label for="dep" class="small muted">At</label>
              <input id="dep" v-model="departTime" type="time" step="900" class="form-control" required />
            </div>
            <div class="col-12 d-flex flex-wrap gap-2 align-items-center">
              <button v-if="!geo" type="button" class="btn btn-ghost btn-sm px-0" @click="useLocation">Use my location instead</button>
              <span v-else class="small">Using your location · <button type="button" class="btn btn-ghost btn-sm px-1" @click="geo = null">use an area</button></span>
              <span v-if="geoError" class="small text-danger" role="alert">{{ geoError }}</span>
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-primary w-100" :disabled="checking">Find where to meet them</button>
            </div>
          </form>

          <div v-if="result" class="result mt-3" role="status">
            <template v-if="result.best">
              <p class="small-caps m-0">Meet them at</p>
              <p class="r-title">Stop {{ result.best.index + 1 }}: {{ result.best.stop.listing.title }}</p>
              <p class="m-0">Arrive about <strong>{{ fmtTime(result.best.arriveMs) }}</strong> after {{ fmtDuration(result.best.travelMins) }} {{ result.best.travelMode === 'walk' ? 'walking' : 'by transit' }}<template v-if="result.best.estimate"> (estimate)</template>.</p>
              <p class="small muted m-0">You get about {{ fmtDuration(result.best.overlapMins) }} there before the group moves on.</p>
              <p v-if="result.options.length > 1" class="small muted mt-2 mb-0">Later stops also work: {{ result.options.slice(1).map((o) => o.stop.listing.title).join(', ') }}.</p>
            </template>
            <template v-else>
              <p class="r-title">No stop works from there</p>
              <p class="small m-0">{{ result.reason }}.</p>
            </template>
          </div>
        </div>

        <MapView class="mt-3" :markers="markers" :start="geo || null" path height="240px" />

        <div class="card-x mt-3 weather">
          <h3 class="h6 small-caps mb-1">Weather near {{ h.startArea.label }}</h3>
          <p v-if="weather" class="m-0"><strong>{{ weather.forecast }}</strong> <span class="small muted">({{ weather.area }}, next 2 hours from NEA)</span></p>
          <p v-if="weather?.wet" class="small m-0 mt-1">Bring an umbrella for the walks between stops.</p>
          <p v-if="weatherError" class="small muted m-0">{{ weatherError }}</p>
          <p v-if="!weather && !weatherError" class="small muted m-0">Checking the forecast...</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.result { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--teal-soft); }
.r-title { font-family: var(--font-display); font-weight: 650; font-size: 1.15rem; margin: 2px 0 4px; }
</style>

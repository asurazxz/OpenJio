<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { getPlan, lateJoin, reopenVoting, setStage, updateHangout, AREAS, currentUser } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { fmtTime, fmtDuration, fmtRange, fmtDay, sgDateKey, fromDateKey, MIN } from '../lib/time.js'
import { buildItineraryText, buildIcs, icsFileName, planLink, meetingLabel, stopLine, directionsUrl as stopDirectionsUrl, sourceUrl, bookingChecks } from '../lib/handoff.js'
import { forecastNear } from '../lib/weather.js'
import { toast, toastError } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import PlanTimeline from './PlanTimeline.vue'
import MapView from './MapView.vue'
import EmptyState from './EmptyState.vue'

const props = defineProps({ detail: { type: Object, required: true } })
const emit = defineEmits(['goto'])
const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const { data: plan, loading: planLoading, error: planError, reload: reloadPlan } = useLive(() => getPlan(h.value.id))

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
// Time inputs step by 5 minutes; a typed value off that grid is rounded to the nearest 5 (never past 23:55).
function snap5(v) {
  const m = /^(\d{2}):(\d{2})/.exec(v || '')
  if (!m) return v
  const total = Math.min(23 * 60 + 55, Math.round((Number(m[1]) * 60 + Number(m[2])) / 5) * 5)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const departTime = ref(snap5(defaultDepart()))
const result = ref(null)
const checking = ref(false)
// What the shown result was worked out from, so it can be read back and never outlives its inputs.
const basis = ref(null)
let checkRequest = 0
function clearResult() { checkRequest++; result.value = null; basis.value = null; checking.value = false }
watch([originArea, geo, departTime], clearResult)

function useLocation() {
  if (h.value.stage !== 'final') return
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
  if (h.value.stage !== 'final' || !slotDay.value || checking.value) return
  const request = ++checkRequest
  checking.value = true
  result.value = null
  basis.value = null
  try {
    const [hh, mm] = departTime.value.split(':').map(Number)
    const departMs = fromDateKey(slotDay.value) + (hh * 60 + mm) * MIN
    const from = geo.value || AREAS.find((a) => a.slug === originArea.value)
    const r = await lateJoin(h.value.id, { from, departMs })
    // A newer request, or a changed input, supersedes this answer.
    if (request !== checkRequest) return
    result.value = r
    basis.value = { origin: from.label, departMs }
  } catch (e) {
    if (request === checkRequest) toastError(e)
  } finally {
    if (request === checkRequest) checking.value = false
  }
}

const weather = ref(null)
const weatherError = ref('')
const weatherLoading = ref(false)
let weatherController
onBeforeUnmount(() => weatherController?.abort())
async function loadWeather(fresh = false) {
  weatherController?.abort()
  if (!h.value.lockedSlot || !['final', 'ended'].includes(h.value.stage)) return
  const controller = new AbortController()
  weatherController = controller
  weather.value = null
  weatherError.value = ''
  weatherLoading.value = true
  try {
    const forecast = await forecastNear(h.value.startArea, h.value.lockedSlot.start, { fresh, signal: controller.signal })
    if (!controller.signal.aborted) weather.value = forecast
  } catch (e) {
    if (!controller.signal.aborted) weatherError.value = e.message
  } finally {
    if (weatherController === controller) weatherLoading.value = false
  }
}
watch(() => [h.value.id, h.value.lockedSlot?.start, h.value.stage], () => { clearResult(); loadWeather() }, { immediate: true })
watch(() => (plan.value?.stops || []).map((s) => s.listingId).join('|'), clearResult)
function weatherTime(value) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? `${fmtDay(ms)}, ${fmtTime(ms)}` : 'Not supplied'
}

const outingDay = computed(() => (slotDay.value ? fmtDay(fromDateKey(slotDay.value)) : ''))
const backup = computed(() => result.value?.options?.[1] || null)
const directionsUrl = computed(() => {
  const st = result.value?.best?.stop.listing
  return st ? `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}&travelmode=transit` : ''
})
// Nothing is sent anywhere until the person chooses to share.
async function shareEta() {
  if (h.value.stage !== 'final' || !result.value?.best) return
  const b = result.value.best
  const text = `Joining late: I should reach ${b.stop.listing.title} around ${fmtTime(b.arriveMs)}.`
  try {
    if (navigator.share) await navigator.share({ title: h.value.title, text })
    else {
      await navigator.clipboard.writeText(text)
      toast('ETA copied. Paste it in the group chat.')
    }
  } catch {
    /* dismissed */
  }
}
const markers = computed(() => (plan.value?.stops || []).map((s, i) => ({ id: i, lat: s.listing.lat, lng: s.listing.lng, label: String(i + 1), title: s.listing.title, active: result.value?.best?.index === i })))

// ---- Handoff: what the group needs to actually go ----
const handoffStops = computed(() => plan.value?.stops || [])
const link = computed(() => planLink(location.origin, h.value.id))
const meeting = computed(() => meetingLabel(h.value))
const checks = computed(() => bookingChecks(handoffStops.value))
const meetingDraft = ref('')
const meetingSaving = ref(false)
async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    toastError(new Error('Could not copy. Select the text and copy it instead.'))
  }
}
const copyItinerary = () => copyText(buildItineraryText({ hangout: h.value, stops: handoffStops.value, link: link.value }), 'Itinerary copied')
const copyLink = () => copyText(link.value, 'Plan link copied')
function downloadCalendar() {
  const ics = buildIcs({ hangout: h.value, stops: handoffStops.value, link: link.value })
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = icsFileName(h.value.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function saveMeetingPoint() {
  if (meetingSaving.value || !isHost.value || h.value.stage !== 'final') return
  meetingSaving.value = true
  try {
    await updateHangout(h.value.id, { meetingPoint: meetingDraft.value })
    meetingDraft.value = ''
    toast('Meeting point saved')
  } catch (e) {
    toastError(e)
  } finally {
    meetingSaving.value = false
  }
}

async function reopen() {
  if (h.value.stage !== 'final' || !isHost.value) return
  if (!(await confirmDialog({ title: 'Reopen voting?', message: 'Everyone will see the plan as not final until you confirm again.', confirmLabel: 'Reopen voting' }))) return
  try {
    await reopenVoting(h.value.id)
    emit('goto', 'plan')
  } catch (e) {
    toastError(e)
  }
}

async function end(stage) {
  if (h.value.stage !== 'final' || !isHost.value) return
  const cancelling = stage === 'cancelled'
  const ok = await confirmDialog(cancelling
    ? { title: 'Cancel this hangout?', message: 'Everyone will see it as cancelled.', confirmLabel: 'Cancel hangout', cancelLabel: 'Keep it', danger: true }
    : { title: 'Mark this hangout as done?', message: 'Everyone will see it as finished.', confirmLabel: 'Mark as done' })
  if (!ok) return
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
    <EmptyState v-if="h.stage === 'cancelled'" title="Hangout cancelled" body="This outing is closed. Start a new hangout when you are ready." tone="teal" />

    <section v-else-if="h.stage !== 'final' && h.stage !== 'ended'" class="unconfirmed" aria-labelledby="unconfirmed-title">
      <div>
        <h3 id="unconfirmed-title" class="u-title">Not confirmed yet</h3>
        <p class="u-lede">Once the host confirms the plan, the final timeline, the late-join helper and the weather for the outing unlock here.</p>
        <p class="u-handoff">Once the host confirms, you'll get a shareable itinerary and calendar file here.</p>
      </div>

      <div>
        <p class="u-kicker">Preview: what you'll get on the day</p>
        <ul class="u-previews">
          <li class="u-card">
            <span class="u-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M6 8.5v7M11 6h9M11 12h9M11 18h9" /></svg>
            </span>
            <div>
              <h4 class="u-card-title">Final timeline <span class="u-tag">Preview</span></h4>
              <p class="u-card-body">Every stop with times and travel.</p>
            </div>
          </li>
          <li class="u-card">
            <span class="u-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z" /><circle cx="12" cy="11" r="2" /></svg>
            </span>
            <div>
              <h4 class="u-card-title">Join later <span class="u-tag">Preview</span></h4>
              <p class="u-card-body">Tell us where you're leaving from and we'll find the stop you can still reach.</p>
            </div>
          </li>
          <li class="u-card">
            <span class="u-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3.5" /><path d="M9 2v1.5M2.5 9H4M4.6 4.6l1 1M13.4 4.6l-1 1M7 17h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7 17Z" /></svg>
            </span>
            <div>
              <h4 class="u-card-title">Weather <span class="u-tag">Preview</span></h4>
              <p class="u-card-body">The forecast near the start area for the outing time.</p>
            </div>
          </li>
        </ul>
      </div>

      <div class="u-actions">
        <button v-if="isHost && !h.lockedSlot" type="button" class="btn btn-primary" @click="emit('goto', 'time')">Choose a time first</button>
        <button v-else-if="isHost" type="button" class="btn btn-primary" @click="emit('goto', 'plan')">Review and confirm the plan</button>
        <button type="button" class="btn" :class="isHost ? 'btn-ghost' : 'btn-secondary'" @click="emit('goto', 'plan')">See the draft plan</button>
      </div>
    </section>

    <div v-else-if="planLoading && !plan" class="py-4" role="status">Loading the confirmed plan…</div>
    <div v-else-if="planError" class="notice danger" role="alert"><p>{{ planError.message }}</p><button type="button" class="btn btn-secondary btn-sm" @click="reloadPlan">Retry loading plan</button></div>
    <div v-else-if="plan" class="row g-4">
      <div v-if="h.stage === 'final'" class="col-12">
        <section class="handoff card-x" aria-labelledby="handoff-title">
          <div class="ho-head">
            <div class="ho-main">
              <h3 id="handoff-title" class="ho-title">Your plan, ready to share</h3>
              <p class="ho-meet" data-testid="meeting-point">
                <template v-if="meeting.exact"><span class="ho-meet-label">Meet at:</span> <strong>{{ meeting.text }}</strong></template>
                <strong v-else>{{ meeting.text }}</strong>
              </p>
              <form v-if="isHost && !meeting.exact" class="ho-set" @submit.prevent="saveMeetingPoint">
                <label for="meeting-point" class="small muted">Set an exact meeting point</label>
                <div class="ho-set-row">
                  <input id="meeting-point" v-model="meetingDraft" class="form-control" maxlength="120" placeholder="Bugis MRT, exit C" autocomplete="off" />
                  <button type="submit" class="btn btn-secondary" :disabled="meetingSaving || !meetingDraft.trim()">Save</button>
                </div>
              </form>
            </div>
            <div class="ho-actions">
              <button type="button" class="btn btn-primary" @click="copyItinerary">Copy itinerary</button>
              <button type="button" class="btn btn-secondary" @click="downloadCalendar">Add to calendar</button>
              <button type="button" class="btn btn-ghost" @click="copyLink">Copy plan link</button>
            </div>
          </div>
          <ol class="ho-stops tnum">
            <li v-for="(s, i) in handoffStops" :key="s.id || i">
              <span class="ho-stop-text">{{ stopLine(s) }}</span>
              <span class="ho-links">
                <a :href="stopDirectionsUrl(s.listing)" target="_blank" rel="noopener noreferrer" :aria-label="`Directions to ${s.listing.title}`">Directions</a>
                <a v-if="sourceUrl(s.listing)" :href="sourceUrl(s.listing)" target="_blank" rel="noopener noreferrer" :aria-label="`Source for ${s.listing.title}`">Source</a>
              </span>
            </li>
          </ol>
          <p class="ho-book">Nothing is booked through OpenJio. Check tickets or reservations before you go.</p>
          <ul v-if="checks.length" class="ho-checks">
            <li v-for="c in checks" :key="c.title"><strong>Check:</strong> {{ c.title }} ({{ c.text }})</li>
          </ul>
        </section>
      </div>
      <div class="col-lg-7">
        <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-3">
          <h3 class="m-0 tnum">{{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}</h3>
          <span class="small muted">Planned times, not live locations.</span>
        </div>
        <PlanTimeline :stops="plan.stops" :start="h.startArea" :active-index="result?.best?.index ?? -1" />
        <div v-if="isHost && h.stage === 'final'" class="d-flex flex-wrap gap-2 mt-3">
          <button type="button" class="btn btn-secondary btn-sm" @click="reopen">Change the plan</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="end('ended')">Mark as done</button>
          <button type="button" class="btn btn-ghost btn-sm text-danger" @click="end('cancelled')">Cancel hangout</button>
        </div>
      </div>

      <aside class="col-lg-5">
        <div v-if="h.stage === 'final'" class="card-x pop join">
          <h3 class="m-0">Joining later?</h3>
          <p class="small muted">Tell us where you are leaving from and when. We find the first stop you can reach with time to spare. When live routing is enabled, your chosen origin, including precise coordinates if you use location, is sent through our server to OneMap to calculate routes. It is not shared with the group.</p>
          <form class="row g-2" @submit.prevent="check">
            <div class="col-7">
              <label for="origin" class="small muted">Leaving from</label>
              <select id="origin" v-model="originArea" class="form-select" :disabled="!!geo">
                <option v-for="a in AREAS" :key="a.slug" :value="a.slug">{{ a.label }}</option>
              </select>
            </div>
            <div class="col-5">
              <label for="dep" class="small muted">Leaving<span v-if="outingDay" class="tnum"> on {{ outingDay }}</span> at</label>
              <input id="dep" v-model="departTime" type="time" step="300" class="form-control" required @change="departTime = snap5(departTime)" />
            </div>
            <div class="col-12 d-flex flex-wrap gap-2 align-items-center">
              <button v-if="!geo" type="button" class="btn btn-ghost btn-sm px-0" @click="useLocation">Use my location instead</button>
              <span v-else class="small">Using your location. <button type="button" class="btn btn-ghost btn-sm px-1" @click="geo = null">use an area</button></span>
              <span v-if="geoError" class="small text-danger" role="alert">{{ geoError }}</span>
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-primary w-100" :disabled="checking">Find where to meet them</button>
            </div>
          </form>

          <Transition name="oj-rise">
            <div v-if="result && basis" class="result mt-3" role="status">
              <p class="small m-0 mb-2 r-basis tnum">Based on leaving {{ basis.origin }} at {{ fmtTime(basis.departMs) }}, {{ fmtDay(basis.departMs) }}.</p>
              <template v-if="result.best">
                <p class="r-label">Meet them at stop {{ result.best.index + 1 }}</p>
                <p class="r-title">{{ result.best.stop.listing.title }}</p>
                <dl class="r-facts tnum">
                  <div><dt>You arrive</dt><dd>{{ fmtTime(result.best.arriveMs) }}</dd></div>
                  <div><dt>Group arrives</dt><dd>{{ fmtTime(result.best.groupStartMs) }}</dd></div>
                </dl>
                <p class="m-0 tnum">
                  <template v-if="result.best.waitMins > 0">Wait about <strong>{{ fmtDuration(result.best.waitMins) }}</strong> for them.</template>
                  <template v-else><strong>You join them partway.</strong></template>
                  Together until <strong>{{ fmtTime(result.best.untilMs) }}</strong> ({{ fmtDuration(result.best.overlapMins) }}).
                </p>
                <p class="small m-0 mt-1 tnum r-meta">
                  About {{ fmtDuration(result.best.travelMins) }} {{ result.best.travelMode === 'walk' ? 'on foot' : 'by MRT or bus' }}<template v-if="result.best.estimate">, estimated from distance</template>. This is a planned time, not a guarantee.
                </p>
                <p v-if="backup" class="small m-0 mt-2 tnum">If it gets tight: stop {{ backup.index + 1 }}, {{ backup.stop.listing.title }}. You arrive {{ fmtTime(backup.arriveMs) }}, meet the group at {{ fmtTime(backup.meetMs) }}, together until {{ fmtTime(backup.untilMs) }} ({{ fmtDuration(backup.overlapMins) }}).</p>
                <div class="d-flex flex-wrap gap-2 mt-3">
                  <a :href="directionsUrl" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">View directions</a>
                  <button type="button" class="btn btn-secondary btn-sm" @click="shareEta">Share my ETA</button>
                </div>
              </template>
              <template v-else>
                <p class="r-title">No stop works from there</p>
                <p class="small m-0">{{ result.reason }}.</p>
              </template>
            </div>
          </Transition>
        </div>

        <MapView class="mt-3" :markers="markers" :start="geo || null" path height="240px" />

        <div class="card-x mt-3 weather">
          <h3 class="h6 small-caps mb-1">Weather near {{ h.startArea.label }}</h3>
          <template v-if="weather?.available">
            <p class="m-0"><strong>{{ weather.forecast }}</strong> <span class="small muted">({{ weather.area }})</span></p>
            <p class="small muted m-0 mt-1">{{ weather.source }} · {{ weather.horizon }} · issued {{ weatherTime(weather.issuedAt) }}</p>
            <p class="small muted m-0">Covers {{ weatherTime(weather.validFrom) }} to {{ weatherTime(weather.validTo) }} (Singapore time). Selected for your outing start.</p>
            <p v-if="weather.temperature" class="small m-0">{{ weather.temperature.low }}–{{ weather.temperature.high }}°C</p>
            <p v-if="weather.wet" class="small m-0 mt-1">Bring an umbrella for the walks between stops.</p>
          </template>
          <p v-else-if="weather" class="small muted m-0">{{ weather.reason }}</p>
          <p v-if="weatherError" class="small muted m-0" role="alert">{{ weatherError }}</p>
          <p v-if="weatherLoading" class="small muted m-0" role="status">Checking weather for the outing…</p>
          <button v-if="!weatherLoading && (weatherError || !weather?.available)" type="button" class="btn btn-ghost btn-sm px-0" @click="loadWeather(true)">Retry forecast</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.handoff { padding: 18px 20px; }
.ho-head { display: flex; flex-wrap: wrap; gap: 16px 24px; justify-content: space-between; align-items: flex-start; }
.ho-main { flex: 1 1 280px; min-width: 0; }
.ho-title { margin: 0 0 6px; }
.ho-meet { margin: 0 0 8px; font-size: 1.15rem; overflow-wrap: anywhere; }
.ho-meet-label { color: var(--ink-2); font-weight: 700; }
.ho-set-row { display: flex; gap: 8px; max-width: 420px; }
.ho-set-row .btn { flex: none; }
.ho-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ho-actions .btn { min-height: 44px; }
.ho-stops { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 0; }
.ho-stops li { display: flex; flex-wrap: wrap; gap: 2px 14px; justify-content: space-between; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--line); }
.ho-stop-text { min-width: 0; overflow-wrap: anywhere; }
.ho-links { display: flex; gap: 14px; font-weight: 700; font-size: 0.9rem; }
.ho-links a { display: inline-flex; align-items: center; min-height: 32px; }
.ho-book { margin: 12px 0 0; color: var(--ink-2); font-size: 0.9rem; }
.ho-checks { margin: 6px 0 0; padding-left: 18px; font-size: 0.9rem; color: var(--ink-2); }
.u-handoff { margin: 8px 0 0; font-weight: 700; max-width: 60ch; }
@media (max-width: 480px) { .ho-actions .btn { flex: 1 1 100%; } .ho-set-row { max-width: none; } }
.result { padding: 14px 16px; border-radius: 16px; background: var(--teal-soft); border: 1px solid color-mix(in srgb, var(--teal) 35%, transparent); }
.r-label { margin: 0; font-weight: 800; font-size: 0.85rem; color: var(--teal-ink); }
.r-title { font-family: var(--font-display); font-weight: 900; font-size: 1.25rem; margin: 2px 0 6px; }
.r-facts { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 0 0 8px; }
.r-facts div { display: grid; }
.r-facts dt { font-size: 0.8rem; font-weight: 700; color: var(--ink-2); }
.r-facts dd { margin: 0; font-family: var(--font-display); font-weight: 900; font-size: 1.15rem; }
.r-meta, .r-basis { color: var(--ink-2); }
.unconfirmed { display: grid; gap: 20px; padding: 24px 20px; border: 1.5px dashed var(--line-strong); border-radius: var(--radius-lg); background: var(--card); }
.u-title { margin: 0 0 6px; }
.u-lede { margin: 0; color: var(--ink-2); max-width: 60ch; }
.u-kicker { margin: 0 0 10px; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-2); }
.u-previews { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: 1fr; }
@media (min-width: 768px) { .u-previews { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.u-card { display: flex; gap: 12px; align-items: flex-start; padding: 14px; min-width: 0; border: 1.5px dashed var(--line-strong); border-radius: var(--radius); background: var(--paper-2); opacity: 0.8; }
.u-ico { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--radius-sm); background: var(--teal-soft); color: var(--teal-ink); }
.u-card-title { margin: 0 0 4px; font-size: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.u-tag { font-size: 0.7rem; font-weight: 800; padding: 1px 8px; border-radius: 999px; border: 1px dashed var(--line-strong); color: var(--ink-2); }
.u-card-body { margin: 0; font-size: 0.9rem; color: var(--ink-2); overflow-wrap: anywhere; }
.u-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.u-actions .btn { min-height: 44px; }
@media (max-width: 480px) { .u-actions .btn { flex: 1 1 100%; } }
</style>

<script setup>
import { ref, watch, onBeforeUnmount, computed, nextTick } from 'vue'
import { addCustomStop, previewCustomStop, SOFT_ISSUES } from '../api/index.js'
import { searchPlaces, placeDetails } from '../lib/places.js'
import { geocode } from '../lib/travel.js'
import { fmtTime } from '../lib/time.js'
import MapView from './MapView.vue'

// Time inputs step by 5 minutes; a typed value off that grid is rounded to the nearest 5 (never past 23:55).
function snap5(v) {
  const m = /^(\d{2}):(\d{2})/.exec(v || '')
  if (!m) return v
  const total = Math.min(23 * 60 + 55, Math.round((Number(m[1]) * 60 + Number(m[2])) / 5) * 5)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
// `draft` is what the parent kept from an earlier visit ({ form, query, checked }); every change is sent back through
// `draft` so closing the dialog or switching tabs does not lose it. `beforeAdd` may veto the add (confirmed plans ask first).
const props = defineProps({ hangoutId: { type: String, required: true }, manual: Boolean, disabled: Boolean, draft: { type: Object, default: null }, beforeAdd: { type: Function, default: null } })
const emit = defineEmits(['added', 'draft'])
const query = ref(''), results = ref([]), loading = ref(false), error = ref(''), saving = ref(false)
const form = ref(null), checked = ref(null), checking = ref(false), addresses = ref([]), locating = ref(false), autoLocating = ref(false)
const POSTAL_CODE = /\b\d{6}\b/
const LOCATE_MISS = 'We couldn\'t find that address. Check it, pick a match with “Find address with OneMap”, or enter coordinates under Advanced.'
const LOCATE_DOWN = 'Address lookup is unavailable right now. Try again shortly, or enter coordinates under Advanced.'
const lookup = async q => (await geocode(q)) || []
let timer, controller, sequence = 0, previewSequence = 0, locateSequence = 0
const blank = () => ({ name: '', address: '', lat: '', lng: '', durationMins: 60, kind: 'activity', opens: '', closes: '', provider: 'manual', providerId: '', website: '', openingHoursText: '' })
let restoring = props.draft
watch(() => props.manual, value => { if (restoring?.form) form.value = { ...blank(), ...restoring.form }; else if (value) form.value = blank(); else form.value = null; error.value = ''; results.value = []; addresses.value = []; locating.value = false; ++locateSequence; controller?.abort(); ++sequence; clearTimeout(timer); loading.value = false }, { immediate: true })
if (restoring) {
  query.value = restoring.query || ''; checked.value = restoring.checked || null
  if (!restoring.form && query.value.trim().length >= 3) nextTick(search)
  restoring = null
}
function cancelSearch() { controller?.abort(); controller = new AbortController(); return { signal: controller.signal, ticket: ++sequence } }
async function search() {
  clearTimeout(timer)
  const q = query.value.trim()
  const { signal, ticket } = cancelSearch()
  error.value = ''; results.value = []; loading.value = false
  if (q.length < 3) return
  loading.value = true
  try {
    const found = await searchPlaces(q, signal)
    if (ticket === sequence) results.value = found
  } catch (e) { if (ticket === sequence && !signal.aborted) error.value = e.message }
  finally { if (ticket === sequence) loading.value = false }
}
watch(query, () => {
  controller?.abort(); ++sequence; results.value = []; error.value = ''; loading.value = false; clearTimeout(timer)
  if (query.value.trim().length >= 3) { loading.value = true; timer = setTimeout(search, 450) }
})
async function choose(place) {
  const { signal, ticket } = cancelSearch()
  loading.value = true; error.value = ''
  // Search already supplies a usable coordinate; missing details must not discard it.
  let detail = place
  try { detail = await placeDetails(place.id, signal) }
  catch (e) { if (ticket === sequence && !signal.aborted) error.value = `${e.message} The search location is still available below.` }
  finally { if (ticket === sequence) loading.value = false }
  if (ticket !== sequence || signal.aborted) return
  form.value = { ...blank(), ...detail, providerId: place.id, provider: 'geoapify' }
  results.value = []
}
watch(form, () => { checked.value = null; ++previewSequence }, { deep: true })
watch([form, query, checked], () => {
  emit('draft', form.value || query.value ? { form: form.value ? { ...form.value } : null, query: query.value, checked: checked.value } : null)
}, { deep: true })
const usableCoordinates = computed(() => form.value && form.value.lat !== '' && form.value.lng !== '' && Number.isFinite(Number(form.value.lat)) && Number.isFinite(Number(form.value.lng)))
const markers = computed(() => usableCoordinates.value ? [{ id: 'custom', lat: Number(form.value.lat), lng: Number(form.value.lng), title: form.value.name, label: '1' }] : [])
const reportedHours = computed(() => (form.value?.openingHoursText || '').replace(/\bMo\b/g, 'Mon').replace(/\bTu\b/g, 'Tue').replace(/\bWe\b/g, 'Wed').replace(/\bTh\b/g, 'Thu').replace(/\bFr\b/g, 'Fri').replace(/\bSa\b/g, 'Sat').replace(/\bSu\b/g, 'Sun').replace(/\boff\b/g, 'closed').replace(/;/g, '; '))
async function locate() {
  const ticket = ++locateSequence, address = form.value.address
  locating.value = true; error.value = ''; addresses.value = []
  try { const found = await geocode(address); if (ticket === locateSequence) addresses.value = found }
  catch { if (ticket === locateSequence) error.value = 'Address lookup is unavailable. Enter the coordinates below or try again.' }
  finally { if (ticket === locateSequence) locating.value = false }
}
watch(() => form.value?.address, () => { ++locateSequence; addresses.value = []; locating.value = false })
function selectAddress(address) {
  Object.assign(form.value, { address: address.address, lat: address.lat, lng: address.lng })
  addresses.value = []
}
// Fills form.lat/lng from OneMap when they are missing. The user's typed address and name are left unchanged.
async function ensureCoordinates() {
  if (usableCoordinates.value) return true
  const target = form.value, address = target.address.trim(), name = target.name.trim()
  const postal = address.match(POSTAL_CODE)?.[0]
  autoLocating.value = true; error.value = ''
  try {
    let found = address ? await lookup(address) : []
    if (!found.length && postal) found = await lookup(postal)
    if (!found.length && name) found = await lookup(name)
    // The user edited the form while the lookup ran; leave their new input alone.
    if (target !== form.value || form.value.address.trim() !== address) return false
    if (!found.length) { error.value = LOCATE_MISS; return false }
    const match = (postal && found.find(place => place.address?.includes(postal))) || found[0]
    form.value.lat = match.lat
    form.value.lng = match.lng
    return true
  } catch {
    if (target === form.value) error.value = LOCATE_DOWN
    return false
  } finally { autoLocating.value = false }
}
async function checkFit() {
  if (!(await ensureCoordinates())) return
  // Setting lat/lng fires the form watcher (which clears `checked`) on the next tick; let it run before this preview starts.
  await nextTick()
  const ticket = ++previewSequence
  checking.value = true; checked.value = null; error.value = ''
  try {
    const result = await previewCustomStop(props.hangoutId, { ...form.value })
    if (ticket === previewSequence) checked.value = result
  } catch (e) { if (ticket === previewSequence) error.value = e.message }
  finally { checking.value = false }
}
const blocking = computed(() => checked.value?.issues.filter(i => !SOFT_ISSUES.includes(i.type)) || [])
async function add() {
  if (saving.value || autoLocating.value || props.disabled) return
  saving.value = true; error.value = ''
  try {
    if (!(await ensureCoordinates())) return
    if (props.beforeAdd && !(await props.beforeAdd())) return
    const place = await addCustomStop(props.hangoutId, { ...form.value })
    emit('added', place)
  }
  catch (e) { error.value = e.message }
  finally { saving.value = false }
}
onBeforeUnmount(() => { clearTimeout(timer); controller?.abort(); ++sequence; ++previewSequence; ++locateSequence })
</script>

<template>
  <div class="custom-place">
    <form v-if="!manual" class="place-search" @submit.prevent="search">
      <label for="external-place-query" class="fw-bold">Find a café, attraction or other place</label>
      <div class="d-flex gap-2">
        <input id="external-place-query" v-model="query" class="form-control" placeholder="Try a café name in Singapore" autocomplete="off" maxlength="100" />
        <button class="btn btn-secondary" :disabled="query.trim().length < 3 || loading">Search</button>
      </div>
      <p class="small muted m-0">Search Singapore places, including venues outside Discover.</p>
    </form>
    <p v-if="loading" class="small muted mt-2" role="status">Looking up places…</p>
    <p v-if="error" class="notice small mt-2" role="alert">{{ error }}</p>
    <ul v-if="results.length" class="place-results">
      <li v-for="place in results" :key="place.id">
        <button type="button" class="place-result" :disabled="loading" @click="choose(place)">
          <strong>{{ place.name }}</strong><span class="small muted">{{ place.address }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="!manual && query.trim().length >= 3 && !loading && !form && !error" class="small muted mt-3">No matching places found. Try another name or use Enter manually.</p>

    <form v-if="form" class="place-details mt-3" @submit.prevent="add">
      <div class="place-fields">
        <label class="field">Place name<input v-model="form.name" class="form-control" required maxlength="160" /></label>
        <label class="field">Address<input v-model="form.address" class="form-control" required maxlength="320" /></label>
        <template v-if="manual">
          <button type="button" class="btn btn-secondary btn-sm justify-self-start" :disabled="locating || !form.address.trim()" @click="locate">{{ locating ? 'Looking up address…' : 'Find address with OneMap' }}</button>
          <ul v-if="addresses.length" class="place-results">
            <li v-for="address in addresses" :key="`${address.lat},${address.lng}`"><button type="button" class="place-result" @click="selectAddress(address)">{{ address.address }}</button></li>
          </ul>
          <details>
            <summary class="small">Advanced: enter coordinates instead</summary>
            <div class="row g-2 mt-1">
              <label class="col-6 field">Latitude<input v-model="form.lat" type="number" step="any" min="1.13" max="1.48" class="form-control" /></label>
              <label class="col-6 field">Longitude<input v-model="form.lng" type="number" step="any" min="103.58" max="104.1" class="form-control" /></label>
            </div>
          </details>
        </template>
        <div class="row g-3">
          <label class="col-sm-6 field">Visit duration (minutes)<input v-model.number="form.durationMins" type="number" min="5" max="480" step="5" required class="form-control" /></label>
          <label class="col-sm-6 field">Stop type<select v-model="form.kind" class="form-select"><option value="activity">Activity / café visit</option><option value="meal">Meal</option></select></label>
        </div>
        <p v-if="reportedHours" class="small muted m-0">Reported hours: {{ reportedHours }}. Confirm the hours for your outing date below.</p>
        <a v-if="form.website" :href="form.website" target="_blank" rel="noopener noreferrer" class="small">Venue website</a>
        <details>
          <summary class="small fw-bold">Add opening hours for the outing day (optional)</summary>
          <p class="small muted my-2">Only enter hours you have checked. Otherwise this stop will show “Hours not verified”.</p>
          <div class="row g-3">
            <label class="col-6 field">Opens<input v-model="form.opens" type="time" step="300" class="form-control" @change="form.opens = snap5(form.opens)" /></label>
            <label class="col-6 field">Closes<input v-model="form.closes" type="time" step="300" class="form-control" @change="form.closes = snap5(form.closes)" /></label>
          </div>
        </details>
      </div>
      <MapView v-if="markers.length" :markers="markers" height="180px" class="mt-3" />
      <div v-if="checked" class="notice mt-3" role="status">
        <p v-if="!blocking.length">Fits the route: {{ fmtTime(checked.stops.at(-1).start) }} to {{ fmtTime(checked.stops.at(-1).end) }}.</p>
        <p v-for="(issue, i) in checked.issues" :key="i" :class="{ 'text-danger': !SOFT_ISSUES.includes(issue.type) }">{{ issue.message }}</p>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-secondary" :disabled="checking || saving || disabled || autoLocating" @click="checkFit">{{ checking ? 'Checking…' : autoLocating ? 'Locating address…' : 'Check fit' }}</button>
        <button type="submit" class="btn btn-primary" :disabled="saving || disabled || autoLocating || !form.name.trim() || !form.address.trim()">{{ saving ? 'Adding…' : autoLocating ? 'Locating address…' : 'Add to route' }}</button>
      </div>
      <p class="small muted mt-2 mb-0">Added to this outing only. It will not appear in Discover.</p>
    </form>
    <p v-if="!manual" class="small muted mt-3 mb-0">Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>. Some places or details may be missing; use Enter manually if needed.</p>
  </div>
</template>

<style scoped>
.place-search, .place-fields { display: grid; gap: 12px; }
.field { display: grid; gap: 5px; font-size: 0.88rem; font-weight: 700; }
.place-results { list-style: none; padding: 0; margin: 12px 0; display: grid; gap: 6px; }
.place-result { display: grid; gap: 4px; text-align: left; width: 100%; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; min-height: 48px; }
.place-result:hover, .place-result:focus-visible { border-color: var(--teal); background: var(--teal-soft); }
summary { cursor: pointer; min-height: 32px; }
</style>

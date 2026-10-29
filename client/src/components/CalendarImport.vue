<script setup>
// Optional Google Calendar free/busy import. Only busy times inside the planning window are read,
// nothing is stored except the resulting free intervals, and the token is revoked straight after.
import { ref } from 'vue'
import { fromDateKey, DAY, HOUR } from '../lib/time.js'
import { subtractBusy, roundBusyOut, mergeIntervals } from '../lib/algo/slots.js'

const props = defineProps({
  days: { type: Array, required: true },
  current: { type: Array, default: () => [] },
})
const emit = defineEmits(['imported'])

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const busy = ref(false)
const error = ref('')

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Google sign-in.'))
    document.head.appendChild(s)
  })
}

async function run() {
  error.value = ''
  busy.value = true
  try {
    await loadGis()
    const accessToken = await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.freebusy',
        callback: (r) => (r.error ? reject(new Error(r.error_description || 'Google sign-in was cancelled.')) : resolve(r.access_token)),
        error_callback: (e) => reject(new Error(e?.message || 'Google sign-in was cancelled.')),
      })
      client.requestAccessToken()
    })
    const timeMin = new Date(fromDateKey(props.days[0])).toISOString()
    const timeMax = new Date(fromDateKey(props.days[props.days.length - 1]) + DAY).toISOString()
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, timeZone: 'Asia/Singapore', items: [{ id: 'primary' }] }),
    })
    window.google.accounts.oauth2.revoke(accessToken, () => {})
    if (!res.ok) throw new Error('Google Calendar did not return your busy times.')
    const data = await res.json()
    const busyTimes = (data.calendars?.primary?.busy || []).map((b) => roundBusyOut({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    // Calendar gaps are not willingness to meet: start from the hours already marked,
    // or a default of 10 am to 10 pm, and remove the conflicts.
    const base = props.current.length
      ? props.current
      : props.days.map((k) => ({ start: fromDateKey(k) + 10 * HOUR, end: fromDateKey(k) + 22 * HOUR }))
    emit('imported', mergeIntervals(subtractBusy(base, busyTimes)))
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="clientId" class="cal">
    <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="run">
      <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
      Remove clashes using Google Calendar
    </button>
    <span class="small muted">Reads busy times for these days only. Nothing else is kept.</span>
    <p v-if="error" class="small text-danger m-0 w-100" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.cal { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>

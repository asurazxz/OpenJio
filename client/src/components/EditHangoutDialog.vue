<script setup>
import { ref, computed, watch } from 'vue'
import { updateHangout, AREAS } from '../api/index.js'
import { sgDateKey, sgParts } from '../lib/time.js'
import { toast } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import AppDialog from './AppDialog.vue'

const props = defineProps({ open: Boolean, hangout: { type: Object, required: true } })
const emit = defineEmits(['close'])
const form = ref({})
const saving = ref(false)
const error = ref('')
const fixed = computed(() => props.hangout.mode === 'solo' || props.hangout.visibility === 'public')
// Time inputs step by 5 minutes; a typed value off that grid is rounded to the nearest 5.
function snap5(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v || '')
  if (!m) return v
  const d = new Date(Date.parse(`${m[1]}T00:00:00Z`) + Math.round((Number(m[2]) * 60 + Number(m[3])) / 5) * 5 * 60000)
  return d.toISOString().slice(0, 16)
}
const at = (ms) => { const p = sgParts(ms); return `${sgDateKey(ms)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` }
function reset() {
  const h = props.hangout
  form.value = { title: h.title, description: h.description || '', meetingPoint: h.meetingPoint || '', area: h.startArea.slug, capacity: h.capacity || 6, dateFrom: h.dateFrom, dateTo: h.dateTo,
    start: h.lockedSlot ? snap5(at(h.lockedSlot.start)) : '', end: h.lockedSlot ? snap5(at(h.lockedSlot.end)) : '' }
  error.value = ''
}
watch(() => props.open, (open) => { if (open) reset() }, { immediate: true })
async function save() {
  if (saving.value) return
  const f = form.value, h = props.hangout
  const datesChanged = !h.lockedSlot && (f.dateFrom !== h.dateFrom || f.dateTo !== h.dateTo)
  if (datesChanged && !(await confirmDialog({ title: 'Change the dates?', message: 'The group’s old availability responses will be cleared.', confirmLabel: 'Change dates', danger: true }))) return
  const patch = { title: f.title, description: f.description, area: f.area, meetingPoint: f.meetingPoint }
  if (h.visibility === 'public') patch.capacity = Number(f.capacity)
  if (datesChanged) Object.assign(patch, { dateFrom: f.dateFrom, dateTo: f.dateTo })
  if (fixed.value) Object.assign(patch, { slotStart: Date.parse(f.start + '+08:00'), slotEnd: Date.parse(f.end + '+08:00') })
  saving.value = true
  error.value = ''
  try { await updateHangout(h.id, patch); toast('Hangout details updated'); emit('close') }
  catch (e) { error.value = e.message }
  finally { saving.value = false }
}
</script>

<template>
  <AppDialog :open="open" title="Edit hangout details" @close="emit('close')">
    <form class="edit-form" @submit.prevent="save">
      <label for="edit-title" class="form-label">Name</label><input id="edit-title" v-model="form.title" class="form-control" required maxlength="60" />
      <label for="edit-description" class="form-label mt-3">A note for the group</label><textarea id="edit-description" v-model="form.description" class="form-control" maxlength="200" rows="2"></textarea>
      <label for="edit-meeting" class="form-label mt-3">Exact meeting point</label><input id="edit-meeting" v-model="form.meetingPoint" class="form-control" maxlength="120" placeholder="Bugis MRT, exit C" autocomplete="off" />
      <label for="edit-area"class="form-label mt-3">Start area</label><select id="edit-area" v-model="form.area" class="form-select"><option v-for="area in AREAS" :key="area.slug" :value="area.slug">{{ area.label }}</option></select>
      <div v-if="fixed" class="row g-3 mt-1"><div class="col-sm-6"><label for="edit-start" class="form-label">Start (Singapore time)</label><input id="edit-start" v-model="form.start" type="datetime-local" step="300" class="form-control" required @change="form.start = snap5(form.start)" /></div><div class="col-sm-6"><label for="edit-end" class="form-label">End (Singapore time)</label><input id="edit-end" v-model="form.end" type="datetime-local" step="300" class="form-control" required @change="form.end = snap5(form.end)" /></div></div>
      <div v-else-if="!hangout.lockedSlot" class="row g-3 mt-1"><div class="col-6"><label for="edit-date-from" class="form-label">First date</label><input id="edit-date-from" v-model="form.dateFrom" type="date" class="form-control" required /></div><div class="col-6"><label for="edit-date-to" class="form-label">Last date</label><input id="edit-date-to" v-model="form.dateTo" type="date" :min="form.dateFrom" class="form-control" required /></div><p class="small muted m-0">Changing dates clears the previous availability responses.</p></div>
      <template v-if="hangout.visibility === 'public'"><label for="edit-capacity" class="form-label mt-3">Capacity</label><input id="edit-capacity" v-model="form.capacity" type="number" :min="Math.max(2, hangout.memberCount)" max="8" step="1" class="form-control" required /></template>
      <p class="small muted mt-3">Changing the start area or locked time reopens voting on an existing plan.</p>
      <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
      <div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button><button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save details' }}</button></div>
    </form>
  </AppDialog>
</template>

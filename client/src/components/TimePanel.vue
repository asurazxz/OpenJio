<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { saveAvailability, clearAvailability, getSlots, lockSlot, unlockSlot, previewSlot } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { dateKeysBetween, fmtRange, fmtDuration, MIN, sgDateKey, sgParts, sgTime } from '../lib/time.js'
import { toast, toastError } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'
import AvailabilityGrid from './AvailabilityGrid.vue'
import AppDialog from './AppDialog.vue'
import UserAvatar from './UserAvatar.vue'

const props = defineProps({ detail: { type: Object, required: true } })
const emit = defineEmits(['locked'])

const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const days = computed(() => (h.value.dateFrom ? dateKeysBetween(h.value.dateFrom, h.value.dateTo) : []))

const mine = ref(props.detail.myAvailability.map((i) => ({ start: i.start, end: i.end })))
const dirty = ref(false)
const grid = ref(null)
const saving = ref(false)
watch(
  () => props.detail.myAvailability,
  (v) => {
    if (!dirty.value) mine.value = v.map((i) => ({ start: i.start, end: i.end }))
  },
)
// Warn before leaving with free times that were marked but not saved.
const guard = () => !dirty.value || confirmDialog({ title: 'Leave without saving?', message: 'Your free times are marked but not saved.', confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true })
onBeforeRouteLeave(guard)
onBeforeRouteUpdate((to, from) => (to.query.tab !== from.query.tab ? guard() : true))
const onUnload = (e) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))
onBeforeUnmount(() => clearTimeout(previewTimer))
function onEdit(v) {
  mine.value = v
  dirty.value = true
}

const { data: slots, error: slotsError, reload } = useLive(() => getSlots(h.value.id))
const view = ref('mine')
const chosen = ref(null)
const comparisonOpen = ref(false)
const adjust = ref(null)
const preview = ref(null)
const previewing = ref(false)
const previewError = ref('')
const lockingId = ref(null)
let previewRequest = 0
let previewTimer = null
const isSoloOrPublic = computed(() => h.value.visibility === 'public' || h.value.mode === 'solo')
// 24-hour values stay as "HH:MM" (inputSlot parses them). Each time is picked as an hour (12-hour
// labels) and a minute in 5-minute steps; "24:00" is the end-of-day midnight.
const pad2 = (n) => String(n).padStart(2, '0')
const startHours = Array.from({ length: 24 }, (_, i) => pad2(i))
const endHours = Array.from({ length: 24 }, (_, i) => pad2(i + 1))
const fiveMinutes = Array.from({ length: 12 }, (_, i) => pad2(i * 5))
// Keep an off-grid minute (for example from a custom slot) selectable so editing never silently drops it.
const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value].sort() : list)
function hourLabel(hh) {
  if (hh === '24') return '12 am (midnight)'
  const n = Number(hh)
  return `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? 'am' : 'pm'}`
}
function timePart(key, part) {
  return computed({
    get: () => adjust.value?.[key].split(':')[part === 'hour' ? 0 : 1],
    set: (value) => {
      const [hh, mm] = adjust.value[key].split(':')
      adjust.value[key] = part === 'hour' ? `${value}:${value === '24' ? '00' : mm}` : `${hh}:${value}`
    },
  })
}
const startHour = timePart('start', 'hour')
const startMinute = timePart('start', 'minute')
const endHour = timePart('end', 'hour')
const endMinute = timePart('end', 'minute')
const startMinutes = computed(() => withCurrent(fiveMinutes, startMinute.value))
const endMinutes = computed(() => withCurrent(fiveMinutes, endMinute.value))
function inputSlot() {
  if (!adjust.value) return null
  const [y, m, d] = adjust.value.date.split('-').map(Number)
  return { start: sgTime(y, m, d, ...adjust.value.start.split(':').map(Number)), end: sgTime(y, m, d, ...adjust.value.end.split(':').map(Number)) }
}
function editSlot(slot = null) {
  invalidatePreview()
  const source = slot || { start: sgTime(...h.value.dateFrom.split('-').map(Number), 18), end: sgTime(...h.value.dateFrom.split('-').map(Number), 20) }
  const p = sgParts(source.start), q = sgParts(source.end)
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const isMidnightEnd = sgDateKey(source.end - 1) === date && q.hour === 0 && q.minute === 0
  adjust.value = { date, start: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`, end: isMidnightEnd ? '24:00' : `${String(q.hour).padStart(2, '0')}:${String(q.minute).padStart(2, '0')}` }
}
function invalidatePreview() { clearTimeout(previewTimer); previewTimer = null; preview.value = null; previewError.value = ''; previewRequest++; previewing.value = false }
// Re-check attendance shortly after the last edit so the result always matches the inputs.
function schedulePreview() {
  clearTimeout(previewTimer)
  previewing.value = true
  previewTimer = setTimeout(() => { previewTimer = null; checkPreview() }, 300)
}
function touchPreview() { invalidatePreview(); if (adjust.value) schedulePreview() }
function closeAdjust() { adjust.value = null; invalidatePreview() }
function openComparison() { chosen.value = null; comparisonOpen.value = true }
function closeComparison() { comparisonOpen.value = false; chosen.value = null }
watch(() => [h.value.id, h.value.dateFrom, h.value.dateTo, h.value.lockedSlot, isHost.value, isSoloOrPublic.value, props.detail.members], () => {
  invalidatePreview()
  if (!isHost.value || isSoloOrPublic.value || h.value.lockedSlot) adjust.value = null
}, { deep: true })
watch(slots, () => { if (adjust.value) touchPreview() }, { deep: true })
// Any change to date, start or end (including opening the dialog) clears the old result and re-checks automatically.
watch(() => (adjust.value ? [adjust.value.date, adjust.value.start, adjust.value.end].join('|') : ''), (key) => { if (key) touchPreview() })
async function checkPreview() {
  if (!adjust.value) return
  const slot = inputSlot()
  if (!slot || !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.end <= slot.start) { previewRequest++; previewing.value = false; preview.value = null; previewError.value = 'End time must be after start time.'; return }
  const request = ++previewRequest
  previewing.value = true
  preview.value = null
  previewError.value = ''
  try {
    const result = await previewSlot(h.value.id, slot)
    if (request !== previewRequest) return
    preview.value = { ...result, start: slot.start, end: slot.end }
  } catch (e) {
    if (request === previewRequest) previewError.value = e.message || 'Could not check this time. Try again.'
  } finally {
    if (request === previewRequest) previewing.value = false
  }
}
async function lockPreview() {
  if (!preview.value?.ok || !adjust.value) return
  await lock({ start: preview.value.start, end: preview.value.end })
}
// The reasons after the headcount, as one short line: "1 person hasn't replied · within preferred hours".
function why(slot) {
  const text = slot.reasons.slice(1).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
// Split who cannot come into "said no" and "has not answered", so the two are never confused.
function breakdown(slot) {
  const unknown = new Set(slots.value?.unknown || [])
  const cant = slot.missingNames.filter((n) => !unknown.has(n))
  const pending = slot.missingNames.filter((n) => unknown.has(n))
  return { free: slot.attendeeNames, cant, pending }
}
const totalMins = computed(() => mine.value.reduce((a, i) => a + (i.end - i.start) / MIN, 0))

// Reply strip: who has answered and who is still waiting.
const showReplies = computed(() => !h.value.lockedSlot && h.value.mode === 'group' && !isSoloOrPublic.value)
const firstName = (name) => (name || 'there').split(' ')[0]
const memberName = (m) => m.user?.name || 'Member'
const repliedMembers = computed(() => props.detail.members.filter((m) => m.respondedAt))
const pendingMembers = computed(() => props.detail.members.filter((m) => !m.respondedAt))
const replySummary = computed(() => {
  const parts = []
  if (repliedMembers.value.length) parts.push(`Replied: ${repliedMembers.value.map((m) => firstName(memberName(m))).join(', ')}`)
  if (pendingMembers.value.length) parts.push(`Waiting for: ${pendingMembers.value.map((m) => memberName(m) + (m.required ? ' (required)' : '')).join(', ')}`)
  return parts.join('. ')
})
const memberTitle = (m) => `${memberName(m)}${m.required ? ', required' : ''}, ${m.respondedAt ? 'replied' : 'not replied yet'}`
async function save(message) {
  saving.value = true
  try {
    await saveAvailability(h.value.id, mine.value, 'grid')
    dirty.value = false
    toast(typeof message === 'string' ? message : mine.value.length ? 'Free times saved' : 'Saved: you are not free in this range')
    view.value = 'group'
    reload()
    return true
  } catch (e) {
    toastError(e)
    return false
  } finally {
    saving.value = false
  }
}
async function clearMine() {
  try {
    await clearAvailability(h.value.id)
    mine.value = []
    dirty.value = false
  } catch (e) {
    toastError(e)
  }
}
// Locking uses the saved availability, so unsaved edits are resolved first: saving can change the ranked list.
async function resolveUnsaved() {
  const choice = await confirmDialog({
    title: 'Save your free times first?',
    message: 'You have free times marked but not saved. Locking uses your saved times, and saving may change the best times.',
    confirmLabel: 'Save and review times',
    extraLabel: 'Discard edits and lock',
    cancelLabel: 'Keep editing',
  })
  if (choice === 'extra') {
    mine.value = props.detail.myAvailability.map((i) => ({ start: i.start, end: i.end }))
    dirty.value = false
    return true
  }
  if (choice === true && await save('Free times saved. The best times may have changed, so review them before locking.')) closeAdjust()
  return false
}
async function lock(slot) {
  if (lockingId.value) return
  if (dirty.value && !(await resolveUnsaved())) return
  lockingId.value = slot.id || `${slot.start}:${slot.end}`
  try {
    await lockSlot(h.value.id, { start: slot.start, end: slot.end })
    toast('Time locked. Next: shape the plan.')
    closeAdjust()
    emit('locked')
  } catch (e) {
    toastError(e)
  } finally {
    lockingId.value = null
  }
}
async function unlock() {
  if (!(await confirmDialog({ title: 'Change the time?', message: 'Everyone will need to agree on the plan again.', confirmLabel: 'Change time', danger: true }))) return
  try {
    await unlockSlot(h.value.id)
  } catch (e) {
    toastError(e)
  }
}
</script>

<template>
  <div>
    <div v-if="h.lockedSlot" class="locked card-x">
      <div>
        <p class="small-caps m-0">Locked time</p>
        <p class="locked-time tnum">{{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}</p>
      </div>
      <button v-if="isHost && h.visibility !== 'public' && h.mode !== 'solo'" type="button" class="btn btn-secondary btn-sm" @click="unlock">Change time</button>
    </div>

    <template v-else>
      <section v-if="showReplies" class="replies" aria-label="Reply status">
        <div class="rp-left">
          <div class="rp-faces" role="group" :aria-label="replySummary">
            <span v-for="m in detail.members" :key="m.userId" class="rp-av" :class="m.respondedAt ? 'done' : 'pending'" :title="memberTitle(m)" aria-hidden="true">
              <UserAvatar :user="m.user" :size="28" />
              <span v-if="!m.respondedAt && m.required" class="visually-hidden">required</span>
            </span>
          </div>
          <p class="rp-count tnum m-0">{{ repliedMembers.length }} of {{ detail.members.length }} replied</p>
        </div>
        <p v-if="!pendingMembers.length" class="rp-done m-0">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Everyone has replied
        </p>
      </section>

      <div class="seg d-lg-none" role="tablist" aria-label="Availability view">
        <button type="button" role="tab" :aria-selected="view === 'mine'" :class="{ on: view === 'mine' }" @click="view = 'mine'">Your times</button>
        <button type="button" role="tab" :aria-selected="view === 'group'" :class="{ on: view === 'group' }" @click="view = 'group'">
          Best times<span v-if="slots?.slots.length" class="count tnum">{{ slots.slots.length }}</span>
        </button>
      </div>

      <div class="row g-4">
        <section class="col-lg-7" :class="{ 'd-none d-lg-block': view !== 'mine' }" aria-labelledby="mine-h">
          <div class="card-x">
            <h3 id="mine-h" class="m-0">Mark free times</h3>
            <p class="small muted mb-3">Mark every time you can make it. After you save, unmarked times count as busy.</p>
            <AvailabilityGrid ref="grid" :days="days" :model-value="mine" label="Your free times" @update:model-value="onEdit" />
            <div class="save-bar" :class="{ unsaved: dirty }">
              <span class="small save-state" :class="{ dirty }" role="status">
                <span class="dot" aria-hidden="true"></span>
                <template v-if="dirty">Unsaved changes · {{ totalMins ? fmtDuration(totalMins) : 'nothing' }} marked</template>
                <template v-else>{{ totalMins ? `${fmtDuration(totalMins)} marked` : 'Nothing marked yet' }}<template v-if="detail.me.respondedAt">, saved</template></template>
              </span>
              <div class="d-flex gap-2">
                <button v-if="dirty" type="button" class="btn btn-ghost btn-sm" :disabled="!grid?.canUndo" @click="grid.undo()">Undo last change</button>
                <button v-if="detail.me.respondedAt && !dirty" type="button" class="btn btn-ghost btn-sm" @click="clearMine">Withdraw</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="saving || (!dirty && detail.me.respondedAt)" @click="save">
                  <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                  {{ detail.me.respondedAt ? (dirty ? 'Save changes' : 'Saved') : 'Save my times' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="col-lg-5" :class="{ 'd-none d-lg-block': view !== 'group' }" aria-labelledby="best-h">
          <div class="card-x">
            <h3 id="best-h" class="m-0">Best times</h3>
            <div v-if="slotsError" class="notice danger mt-3" role="alert"><p>Suggested times could not be loaded. Your saved availability is unchanged.</p><button type="button" class="btn btn-secondary btn-sm" @click="reload">Try again</button></div>
            <p class="small muted mb-3 tnum">{{ slots ? `${slots.responded} of ${slots.total} replied.` : '' }} People who have not replied count as unknown, not free.</p>

            <div v-if="slots?.missingRequired.length" class="notice mb-3">
              <p>Waiting on {{ slots.missingRequired.join(', ') }}. Required people must reply before times are suggested.</p>
            </div>
            <div v-else-if="slots && !slots.slots.length" class="notice mb-3">
              <p>No time works yet for the required people for at least 2 hours. Try marking more hours, or ask the host to make someone optional.</p>
            </div>

            <TransitionGroup v-if="slots?.slots.length" tag="ol" name="oj-rise" appear class="slots">
              <li v-for="(s, i) in slots.slots" :key="s.id">
                <article class="slot" :class="{ best: i === 0, picked: chosen === s.id }" :aria-labelledby="`slot-${s.id}`">
                  <div class="slot-head">
                    <span class="rank tnum" :aria-label="`Rank ${i + 1}`">#{{ i + 1 }}</span>
                    <div class="min-w-0">
                      <p :id="`slot-${s.id}`" class="slot-time tnum">{{ fmtRange(s.start, s.end) }}</p>
                      <p class="slot-count tnum"><strong>{{ s.attendees.length }} of {{ slots.total }}</strong> available</p>
                    </div>
                  </div>
                  <ul class="who">
                    <li v-if="breakdown(s).free.length" class="w-free"><span class="w-k">Free</span> {{ breakdown(s).free.join(', ') }}</li>
                    <li v-if="breakdown(s).cant.length" class="w-cant"><span class="w-k">Can't</span> {{ breakdown(s).cant.join(', ') }}</li>
                    <li v-if="breakdown(s).pending.length" class="w-pend"><span class="w-k">No reply</span> {{ breakdown(s).pending.join(', ') }}</li>
                  </ul>
                  <p v-if="s.reasons.length > 1" class="small muted m-0">{{ why(s) }}</p>
                  <div class="slot-act">
                    <button type="button" class="btn-text" :aria-pressed="chosen === s.id" @click="chosen = s.id; comparisonOpen = true">Show on grid</button>
                    <button v-if="isHost && !isSoloOrPublic" type="button" class="btn btn-sm" :class="i === 0 ? 'btn-primary' : 'btn-secondary'" :disabled="!!lockingId" @click="lock(s)">{{ lockingId === s.id ? 'Locking…' : 'Lock this time' }}</button>
                    <button v-if="isHost && !isSoloOrPublic" type="button" class="btn-text" @click="editSlot(s)">Adjust time</button>
                  </div>
                </article>
              </li>
            </TransitionGroup>
            <p v-if="!isHost && slots?.slots.length" class="small muted">The host will lock one of these.</p>

            <div class="d-flex gap-2 flex-wrap mt-2">
              <button v-if="slots?.responded" type="button" class="btn btn-ghost btn-sm" :aria-expanded="comparisonOpen" @click="openComparison">View group overlap</button>
              <button v-if="isHost && !isSoloOrPublic && days.length" type="button" class="btn btn-secondary btn-sm" @click="editSlot()">Choose custom time</button>
            </div>
          </div>
        </section>
      </div>

      <AppDialog :open="comparisonOpen" title="Group overlap" wide class="overlap-dialog" @close="closeComparison">
        <div class="compare-layout">
          <section aria-label="Availability overlap">
            <div class="overlap-grid"><AvailabilityGrid :days="days" readonly :counts="slots?.heatmap || []" :total="slots?.responded || 0" :highlight="slots?.slots.find((x) => x.id === chosen) || null" label="Group overlap" /></div>
            <p class="small muted mt-2 mb-0">Darker means more people free. Only totals are shown, never anyone's individual availability.</p>
          </section>
          <section aria-label="Recommended times">
            <h3 class="h5">Suggested times</h3>
            <p class="small muted">Compare each recommendation with the group overlap.</p>
            <ol class="compare-slots">
              <li v-for="(s, i) in slots?.slots || []" :key="s.id">
                <button type="button" class="compare-choice" :aria-pressed="chosen === s.id" @click="chosen = chosen === s.id ? null : s.id">
                  <strong>#{{ i + 1 }} · {{ fmtRange(s.start, s.end) }}</strong><span>{{ s.attendees.length }} of {{ slots.total }} available</span>
                </button>
              </li>
            </ol>
            <button v-if="isHost && !isSoloOrPublic" type="button" class="btn btn-secondary btn-sm mt-2" @click="closeComparison(); editSlot()">Choose custom time</button>
          </section>
        </div>
      </AppDialog>

      <AppDialog :open="!!adjust" title="Group overlap and timing" wide class="overlap-dialog" @close="closeAdjust">
        <div v-if="adjust" class="adjust-layout">
          <section class="adjust-overlap" aria-label="Availability overlap for proposed time">
            <h3 class="h5">Group overlap</h3>
            <div class="overlap-grid"><AvailabilityGrid :days="days" readonly :counts="slots?.heatmap || []" :total="slots?.responded || 0" :highlight="inputSlot()" label="Group overlap with proposed time" /></div>
            <p class="small muted mt-2 mb-0">Only totals are shown. The outline marks the proposed time.</p>
          </section>
          <section class="adjust-form" aria-label="Adjust proposed time">
          <h3 class="h5">Adjust proposed time</h3>
          <p class="small muted">Required people must be available for the full time. Attendance updates as you change the time.</p>
          <div class="row g-3">
            <div class="col-12"><label for="slot-date" class="form-label">Date</label><input id="slot-date" v-model="adjust.date" type="date" class="form-control" :min="h.dateFrom" :max="h.dateTo" /></div>
            <div class="col-6">
              <label for="slot-start" class="form-label">Start time</label>
              <div class="time-pick">
                <select id="slot-start" v-model="startHour" class="form-select"><option v-for="hh in startHours" :key="hh" :value="hh">{{ hourLabel(hh) }}</option></select>
                <select v-model="startMinute" class="form-select" aria-label="Start minutes"><option v-for="mm in startMinutes" :key="mm" :value="mm">:{{ mm }}</option></select>
              </div>
            </div>
            <div class="col-6">
              <label for="slot-end" class="form-label">End time</label>
              <div class="time-pick">
                <select id="slot-end" v-model="endHour" class="form-select"><option v-for="hh in endHours" :key="hh" :value="hh">{{ hourLabel(hh) }}</option></select>
                <select v-model="endMinute" class="form-select" aria-label="End minutes" :disabled="endHour === '24'"><option v-for="mm in endMinutes" :key="mm" :value="mm">:{{ mm }}</option></select>
              </div>
            </div>
          </div>
          <div v-if="previewError" class="notice danger mt-3" role="alert">{{ previewError }}</div>
          <p class="small muted mt-2 mb-0" role="status">{{ previewing ? 'Checking who can come…' : '' }}</p>
          <div v-if="preview" class="notice mt-3" :class="{ danger: !preview.ok }" aria-live="polite">
            <strong>{{ preview.ok ? 'This time can be locked' : 'This time needs changes' }}</strong>
            <p v-for="error in preview.errors" :key="error" class="small mb-1">{{ error }}</p>
            <p v-if="preview.attendeeNames?.length" class="small mb-1"><strong>Free:</strong> {{ preview.attendeeNames.join(', ') }}</p>
            <p v-if="preview.missingNames?.length" class="small mb-1"><strong>Unavailable:</strong> {{ preview.missingNames.join(', ') }}</p>
            <p v-if="preview.unknown?.length" class="small mb-0"><strong>No reply:</strong> {{ preview.unknown.join(', ') }}</p>
            <p v-if="preview.missingRequired?.length" class="small mb-0"><strong>Required conflicts:</strong> {{ preview.missingRequired.join(', ') }}</p>
          </div>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-ghost" @click="closeAdjust">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="!preview?.ok || preview.start !== inputSlot()?.start || preview.end !== inputSlot()?.end" @click="lockPreview">Lock this time</button>
          </div>
          </section>
        </div>
      </AppDialog>
    </template>
  </div>
</template>

<style scoped>
.locked { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.locked-time { font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; margin: 2px 0 0; }
.seg { display: flex; background: var(--paper-2); border-radius: 14px; padding: 4px; margin-bottom: 16px; }
.seg button { flex: 1; border: 0; background: none; min-height: 40px; padding: 8px; border-radius: 11px; font-weight: 700; color: var(--ink-2); }
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.count { margin-left: 6px; background: var(--tomato); color: var(--on-accent); border-radius: 999px; padding: 0 7px; font-size: 0.75rem; }
.save-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1.5px dashed var(--line); flex-wrap: wrap; }
/* While there are unsaved edits the bar sticks to the bottom of the screen, inside the card, so Save is always in reach. */
.save-bar.unsaved {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin: 14px -18px -18px;
  padding: 12px 18px;
  background: var(--card);
  border-top: 1.5px solid var(--line-strong);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  box-shadow: 0 -8px 18px rgba(var(--oj-shadow-rgb), 0.08);
}
@media (max-width: 767.98px) { .save-bar.unsaved { bottom: calc(68px + env(safe-area-inset-bottom)); } }
.save-state { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-2); font-weight: 600; }
.save-state .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--teal); }
.save-state.dirty .dot { background: var(--mustard); }
.slots { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 10px; }
.slot {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--card);
}
.slot.best { border-color: color-mix(in srgb, var(--tomato) 45%, var(--line)); box-shadow: var(--shadow-pop); }
.slot.picked { outline: 3px solid var(--tomato); outline-offset: 2px; }
.slot-head { display: flex; gap: 12px; align-items: flex-start; }
.min-w-0 { min-width: 0; }
.rank {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--paper-2);
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1rem;
  color: var(--ink-2);
}
.best .rank { background: var(--tomato); color: var(--on-accent); transform: rotate(-4deg); }
.slot-time { font-weight: 800; margin: 0; font-family: var(--font-display); font-size: 1.05rem; }
.slot-count { margin: 0; font-size: 0.9rem; }
.who { list-style: none; padding: 0; margin: 0; display: grid; gap: 3px; font-size: 0.88rem; }
.w-k { display: inline-block; min-width: 68px; font-weight: 700; font-size: 0.78rem; padding: 1px 8px; border-radius: 999px; margin-right: 6px; text-align: center; }
.w-free .w-k { background: var(--teal-soft); color: var(--teal-ink); }
.w-cant .w-k { background: var(--paper-2); color: var(--ink-2); }
.w-pend .w-k { background: var(--mustard-soft); color: var(--mustard-ink); }
.slot-act { display: flex; justify-content: flex-end; align-items: center; gap: 6px 14px; flex-wrap: wrap; }
/* Secondary actions on a best-time card read as links so "Lock this time" is the one button. */
.btn-text { min-height: 36px; padding: 0 2px; border: 0; background: none; color: var(--ink-2); font-size: 0.88rem; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.btn-text:hover { color: var(--ink); }
.btn-text:focus-visible { outline: 2px solid var(--tomato); outline-offset: 2px; border-radius: 4px; }
.btn-text[aria-pressed='true'] { color: var(--tomato-ink, var(--ink)); }
.compare-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, .8fr); gap: 22px; }
.adjust-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, .85fr); gap: 24px; align-items: start; }
.overlap-grid { max-height: min(58vh, 560px); overflow: auto; overscroll-behavior: contain; border-radius: 12px; }
@media (min-width: 768px) {
  .overlap-grid { max-height: none; overflow: visible; }
  .overlap-grid :deep(.grid-wrap) { --grid-top: 0px; max-height: min(58vh, 560px); overflow: auto; }
}
.compare-slots { display: grid; gap: 8px; padding-left: 0; list-style: none; }
.compare-choice { display: grid; gap: 3px; width: 100%; text-align: left; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 12px; padding: 10px; }
.compare-choice[aria-pressed="true"] { outline: 3px solid var(--tomato); }
.compare-choice span { font-size: .85rem; color: var(--ink-2); }
.adjust-form { max-width: 680px; }
.time-pick { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 6px; }
@media (max-width: 767.98px) {
  .compare-layout, .adjust-layout { grid-template-columns: 1fr; }
  .adjust-layout .overlap-grid { max-height: 32vh; }
}
.replies { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 14px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--card); }
.rp-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.rp-faces { display: flex; align-items: center; padding: 3px 0; }
.rp-av { position: relative; display: inline-grid; border-radius: 50%; }
.rp-av + .rp-av { margin-left: 6px; }
.rp-av.pending { outline: 1.5px dashed var(--line-strong); outline-offset: 2px; }
.rp-av.pending :deep(.avatar) { background: var(--paper-2); color: var(--ink-2); border-style: dashed; border-color: var(--line-strong); }
.rp-av.done { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--oj-teal); }
.rp-count { font-weight: 700; color: var(--ink); font-size: 0.92rem; }
.rp-done { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.92rem; color: var(--teal-ink); }
:deep(.dlg.overlap-dialog) { width: min(1120px, calc(100vw - 32px)); }
@media (max-width: 767.98px) { :deep(.dlg.overlap-dialog) { width: calc(100vw - 12px); max-height: calc(100vh - 12px); border-radius: 20px; } }
</style>

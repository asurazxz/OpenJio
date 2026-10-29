<script setup>
import { ref, computed, watch } from 'vue'
import { saveAvailability, clearAvailability, getSlots, lockSlot, unlockSlot } from '../api/index.js'
import { useLive } from '../composables/useLive.js'
import { dateKeysBetween, fmtRange, fmtDuration, MIN } from '../lib/time.js'
import { toast, toastError } from '../lib/toast.js'
import AvailabilityGrid from './AvailabilityGrid.vue'
import CalendarImport from './CalendarImport.vue'

const props = defineProps({ detail: { type: Object, required: true } })
const emit = defineEmits(['locked'])

const h = computed(() => props.detail.hangout)
const isHost = computed(() => h.value.myRole === 'host')
const days = computed(() => (h.value.dateFrom ? dateKeysBetween(h.value.dateFrom, h.value.dateTo) : []))

const mine = ref(props.detail.myAvailability.map((i) => ({ start: i.start, end: i.end })))
const dirty = ref(false)
const saving = ref(false)
watch(
  () => props.detail.myAvailability,
  (v) => {
    if (!dirty.value) mine.value = v.map((i) => ({ start: i.start, end: i.end }))
  },
)
function onEdit(v) {
  mine.value = v
  dirty.value = true
}

const { data: slots, reload } = useLive(() => getSlots(h.value.id))
const view = ref('mine')
const chosen = ref(null)
const showHeat = ref(false)

const totalMins = computed(() => mine.value.reduce((a, i) => a + (i.end - i.start) / MIN, 0))

async function save() {
  saving.value = true
  try {
    await saveAvailability(h.value.id, mine.value, 'grid')
    dirty.value = false
    toast(mine.value.length ? 'Free times saved' : 'Saved: you are not free in this range')
    view.value = 'group'
    reload()
  } catch (e) {
    toastError(e)
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
function onImported(intervals) {
  mine.value = intervals
  dirty.value = true
  toast('Calendar conflicts removed. Check the grid, then save.')
}

async function lock(slot) {
  try {
    await lockSlot(h.value.id, { start: slot.start, end: slot.end })
    toast('Time locked. Next: shape the plan.')
    emit('locked')
  } catch (e) {
    toastError(e)
  }
}
async function unlock() {
  if (!window.confirm('Change the time? Everyone will need to agree on the plan again.')) return
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
        <p class="locked-time">{{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}</p>
      </div>
      <button v-if="isHost && h.visibility !== 'public' && h.mode !== 'solo'" type="button" class="btn btn-secondary btn-sm" @click="unlock">Change time</button>
    </div>

    <template v-else>
      <div class="seg d-lg-none" role="tablist" aria-label="Availability view">
        <button type="button" role="tab" :aria-selected="view === 'mine'" :class="{ on: view === 'mine' }" @click="view = 'mine'">Your times</button>
        <button type="button" role="tab" :aria-selected="view === 'group'" :class="{ on: view === 'group' }" @click="view = 'group'">
          Best times<span v-if="slots?.slots.length" class="count">{{ slots.slots.length }}</span>
        </button>
      </div>

      <div class="row g-4">
        <section class="col-lg-6" :class="{ 'd-none d-lg-block': view !== 'mine' }" aria-labelledby="mine-h">
          <div class="card-x">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
              <div>
                <h3 id="mine-h" class="m-0">When are you free?</h3>
                <p class="small muted m-0">Mark the hours you would actually go out, not every gap in your calendar.</p>
              </div>
            </div>
            <CalendarImport :days="days" :current="mine" class="mb-3" @imported="onImported" />
            <AvailabilityGrid :days="days" :model-value="mine" label="Your free times" @update:model-value="onEdit" />
            <div class="save-bar">
              <span class="small muted">{{ totalMins ? `${fmtDuration(totalMins)} marked` : 'Nothing marked yet' }}<template v-if="dirty"> · unsaved</template></span>
              <div class="d-flex gap-2">
                <button v-if="detail.me.respondedAt" type="button" class="btn btn-ghost btn-sm" @click="clearMine">Withdraw</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="saving || (!dirty && detail.me.respondedAt)" @click="save">
                  {{ detail.me.respondedAt ? (dirty ? 'Save changes' : 'Saved') : 'Save my times' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="col-lg-6" :class="{ 'd-none d-lg-block': view !== 'group' }" aria-labelledby="best-h">
          <div class="card-x">
            <h3 id="best-h" class="m-0">Best times</h3>
            <p class="small muted mb-3">{{ slots ? `${slots.responded} of ${slots.total} replied.` : '' }} People who have not replied count as unknown, not free.</p>

            <div v-if="slots?.missingRequired.length" class="notice mb-3">
              <p>Waiting on {{ slots.missingRequired.join(', ') }}. Required people must reply before times are suggested.</p>
            </div>
            <div v-else-if="slots && !slots.slots.length" class="notice mb-3">
              <p>No time works yet for the required people for at least 2 hours. Try marking more hours, or ask the host to make someone optional.</p>
            </div>

            <ol v-if="slots?.slots.length" class="slots">
              <li v-for="(s, i) in slots.slots" :key="s.id">
                <div class="slot" :class="{ best: i === 0, picked: chosen === s.id }">
                  <div class="slot-main">
                    <span v-if="i === 0" class="tag tag-tomato mb-1">Best match</span>
                    <p class="slot-time">{{ fmtRange(s.start, s.end) }}</p>
                    <p class="small m-0"><strong>{{ s.attendees.length }} of {{ slots.total }}</strong> can make it<span v-if="s.missingNames.length" class="muted">. Missing: {{ s.missingNames.join(', ') }}</span></p>
                    <p class="small muted m-0">{{ s.reasons.slice(1).join(' · ') }}</p>
                  </div>
                  <div class="slot-act">
                    <button type="button" class="btn btn-ghost btn-sm" :aria-pressed="chosen === s.id" @click="chosen = chosen === s.id ? null : s.id">{{ chosen === s.id ? 'Hide' : 'Show' }}</button>
                    <button v-if="isHost" type="button" class="btn btn-sm" :class="i === 0 ? 'btn-primary' : 'btn-secondary'" @click="lock(s)">Lock</button>
                  </div>
                </div>
              </li>
            </ol>
            <p v-if="!isHost && slots?.slots.length" class="small muted">The host will lock one of these.</p>

            <button v-if="slots?.responded" type="button" class="btn btn-ghost btn-sm px-0 mt-1" :aria-expanded="showHeat || !!chosen" @click="showHeat = !showHeat">{{ showHeat || chosen ? 'Hide' : 'Show' }} everyone's overlap</button>
            <div v-if="(showHeat || chosen) && slots" class="mt-2">
              <AvailabilityGrid
                :days="days"
                readonly
                :counts="slots.heatmap"
                :total="slots.responded"
                :highlight="slots.slots.find((x) => x.id === chosen) || null"
                label="Group overlap"
              />
              <p class="small muted mt-2 mb-0">Darker means more people free. Only totals are shown, never anyone's own calendar.</p>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.locked { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.locked-time { font-family: var(--font-display); font-size: 1.35rem; font-weight: 650; margin: 2px 0 0; }
.seg { display: flex; background: var(--paper-2); border-radius: 999px; padding: 4px; margin-bottom: 16px; }
.seg button { flex: 1; border: 0; background: none; padding: 8px; border-radius: 999px; font-weight: 650; color: var(--ink-2); }
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.count { margin-left: 6px; background: var(--tomato); color: var(--on-accent); border-radius: 999px; padding: 0 7px; font-size: 0.75rem; }
.save-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1.5px dashed var(--line); flex-wrap: wrap; }
.slots { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 10px; }
.slot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--paper);
}
.slot.best { border-color: var(--line-strong); background: var(--card); box-shadow: var(--shadow-pop); }
.slot.picked { outline: 3px solid var(--mustard); }
.slot-time { font-weight: 700; margin: 0 0 2px; }
.slot-act { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
</style>

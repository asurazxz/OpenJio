<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
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
// Warn before leaving with free times that were marked but not saved.
const guard = () => !dirty.value || window.confirm('Leave without saving your free times?')
onBeforeRouteLeave(guard)
onBeforeRouteUpdate((to, from) => (to.query.tab !== from.query.tab ? guard() : true))
const onUnload = (e) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))
function onEdit(v) {
  mine.value = v
  dirty.value = true
}

const { data: slots, reload } = useLive(() => getSlots(h.value.id))
const view = ref('mine')
const chosen = ref(null)
const showHeat = ref(false)

// Split who cannot come into "said no" and "has not answered", so the two are never confused.
function breakdown(slot) {
  const unknown = new Set(slots.value?.unknown || [])
  const cant = slot.missingNames.filter((n) => !unknown.has(n))
  const pending = slot.missingNames.filter((n) => unknown.has(n))
  return { free: slot.attendeeNames, cant, pending }
}
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
        <p class="locked-time tnum">{{ fmtRange(h.lockedSlot.start, h.lockedSlot.end) }}</p>
      </div>
      <button v-if="isHost && h.visibility !== 'public' && h.mode !== 'solo'" type="button" class="btn btn-secondary btn-sm" @click="unlock">Change time</button>
    </div>

    <template v-else>
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
            <p class="small muted mb-3">Mark the hours you would actually go out, not every gap in your calendar. Blank means no answer, not busy.</p>
            <CalendarImport :days="days" :current="mine" class="mb-3" @imported="onImported" />
            <AvailabilityGrid :days="days" :model-value="mine" label="Your free times" @update:model-value="onEdit" />
            <div class="save-bar">
              <span class="small save-state" :class="{ dirty }" role="status">
                <span class="dot" aria-hidden="true"></span>
                {{ totalMins ? `${fmtDuration(totalMins)} marked` : 'Nothing marked yet' }}<template v-if="dirty">, not saved yet</template><template v-else-if="detail.me.respondedAt">, saved</template>
              </span>
              <div class="d-flex gap-2">
                <button v-if="detail.me.respondedAt" type="button" class="btn btn-ghost btn-sm" @click="clearMine">Withdraw</button>
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
                  <p v-if="s.reasons.length > 1" class="small muted m-0">{{ s.reasons.slice(1).join('. ') }}.</p>
                  <div class="slot-act">
                    <button type="button" class="btn btn-ghost btn-sm" :aria-pressed="chosen === s.id" @click="chosen = chosen === s.id ? null : s.id">{{ chosen === s.id ? 'Hide on grid' : 'Show on grid' }}</button>
                    <button v-if="isHost" type="button" class="btn btn-sm" :class="i === 0 ? 'btn-primary' : 'btn-secondary'" @click="lock(s)">Lock this time</button>
                  </div>
                </article>
              </li>
            </TransitionGroup>
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
.locked-time { font-family: var(--font-display); font-size: 1.35rem; font-weight: 800; margin: 2px 0 0; }
.seg { display: flex; background: var(--paper-2); border-radius: 14px; padding: 4px; margin-bottom: 16px; }
.seg button { flex: 1; border: 0; background: none; min-height: 40px; padding: 8px; border-radius: 11px; font-weight: 700; color: var(--ink-2); }
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.count { margin-left: 6px; background: var(--tomato); color: var(--on-accent); border-radius: 999px; padding: 0 7px; font-size: 0.75rem; }
.save-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1.5px dashed var(--line); flex-wrap: wrap; }
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
.slot-act { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
</style>

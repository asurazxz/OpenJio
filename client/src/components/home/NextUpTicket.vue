<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { getPlan, getHangout } from '../../api/index.js'
import { revision } from '../../api/store.js'
import { forecastNear } from '../../lib/weather.js'
import { sgParts, sgDateKey, fromDateKey, fmtTime, fmtRange, DAY } from '../../lib/time.js'
import UserAvatar from '../UserAvatar.vue'

// The soonest confirmed hangout as a ticket: date stub, route strip, who is in, weather if NEA has it.
const props = defineProps({ hangout: { type: Object, default: null } })

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const start = computed(() => props.hangout?.lockedSlot?.start ?? null)
const parts = computed(() => (start.value == null ? null : sgParts(start.value)))
const daysAway = computed(() => (start.value == null ? 0 : Math.round((fromDateKey(sgDateKey(start.value)) - fromDateKey(sgDateKey(Date.now()))) / DAY)))
const away = computed(() => (daysAway.value <= 0 ? 'today' : daysAway.value === 1 ? 'tomorrow' : `in ${daysAway.value} days`))
const confirmed = computed(() => props.hangout?.stage === 'final')

const plan = ref(null)
const members = ref([])
const weather = ref(null)
let seq = 0
let controller

async function load() {
  const h = props.hangout
  const mine = ++seq
  controller?.abort()
  weather.value = null
  if (!h) { plan.value = null; members.value = []; return }
  const [p, g] = await Promise.allSettled([getPlan(h.id), getHangout(h.id)])
  if (mine !== seq) return
  plan.value = p.status === 'fulfilled' ? p.value : null
  members.value = g.status === 'fulfilled' ? g.value.members : []
  // NEA only covers a few days ahead; anything further out simply shows no weather.
  if (h.lockedSlot && h.lockedSlot.start > Date.now() - DAY && h.lockedSlot.start - Date.now() < 4.5 * DAY) {
    controller = new AbortController()
    try {
      const f = await forecastNear(h.startArea, h.lockedSlot.start, { signal: controller.signal })
      if (mine === seq && f?.available) weather.value = f
    } catch { /* no forecast, no weather line */ }
  }
}
watch([() => props.hangout?.id, () => props.hangout?.lockedSlot?.start, revision], load, { immediate: true })
onBeforeUnmount(() => { seq++; controller?.abort() })

const stops = computed(() => (plan.value && !plan.value.empty && !plan.value.broken ? plan.value.stops || [] : []))
// All members, not only those who replied: the app records membership, not an attendance response.
const going = computed(() => members.value.map((m) => m.user))
</script>

<template>
  <article v-if="hangout" class="ticket" data-tour="home-next" aria-labelledby="next-title">
    <div class="stub" aria-hidden="true">
      <span class="s-wd">{{ WEEKDAYS[parts.weekday] }}</span>
      <span class="s-day tnum">{{ parts.day }}</span>
      <span class="s-mo">{{ MONTHS[parts.month - 1] }}</span>
      <span class="s-away">{{ away }}</span>
    </div>
    <div class="t-body">
      <p class="t-label">Next up · {{ confirmed ? 'Confirmed' : 'Time locked' }}</p>
      <h2 id="next-title" class="t-title">{{ hangout.title }}</h2>
      <p class="t-when tnum"><span class="visually-hidden">{{ away }}, </span>{{ fmtRange(hangout.lockedSlot.start, hangout.lockedSlot.end) }}</p>

      <ol v-if="stops.length" class="route" aria-label="Route">
        <li class="stop stop-start">{{ hangout.startArea.label }}</li>
        <template v-for="st in stops" :key="st.id">
          <li class="arrow" aria-hidden="true">→</li>
          <li class="stop"><span class="tnum">{{ fmtTime(st.start) }}</span> {{ st.listing.title }}</li>
        </template>
      </ol>
      <p v-else class="shaping">Plan being shaped</p>

      <div class="t-meta">
        <div v-if="going.length" class="going">
          <span class="stack" aria-hidden="true"><UserAvatar v-for="u in going.slice(0, 5)" :key="u.id" :user="u" :size="28" class="stacked" /></span>
          <span class="small fw-bold tnum">{{ going.length }} {{ going.length === 1 ? 'member' : 'members' }}</span>
        </div>
        <p v-if="weather" class="weather small" :class="{ wet: weather.wet }">{{ weather.forecast }}</p>
      </div>

      <RouterLink :to="{ path: `/h/${hangout.id}`, query: { tab: 'plan' } }" class="btn btn-primary t-open">
        Open plan<span class="visually-hidden">: {{ hangout.title }}</span>
      </RouterLink>
    </div>
  </article>

  <article v-else class="ticket empty" data-tour="home-next" aria-labelledby="next-title">
    <div class="stub" aria-hidden="true"><span class="s-plus">+</span></div>
    <div class="t-body">
      <p class="t-label">Next up</p>
      <h2 id="next-title" class="t-title">Nothing planned yet</h2>
      <p class="shaping">Pick a few days, see who is free, and plan it together.</p>
      <RouterLink to="/new?mode=group" class="btn btn-primary t-open">Create a jio</RouterLink>
    </div>
  </article>
</template>

<style scoped>
.ticket {
  position: relative;
  display: grid;
  grid-template-columns: 104px 1fr;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}
.stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 18px 8px;
  background: var(--tomato-soft);
  color: var(--tomato-ink);
  border-right: 2px dashed color-mix(in srgb, var(--tomato) 45%, transparent);
  text-align: center;
}
.s-wd, .s-mo { font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.8rem; }
.s-day { font-family: var(--font-display); font-weight: 900; font-size: 3rem; line-height: 1; }
.s-away { margin-top: 8px; font-weight: 700; font-size: 0.8rem; }
.s-plus { font-family: var(--font-display); font-weight: 900; font-size: 3rem; line-height: 1; }
/* Perforation notches where the dashed edge meets the card border. */
.ticket::before, .ticket::after {
  content: '';
  position: absolute;
  left: 104px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--line);
  transform: translateX(-9px);
}
.ticket::before { top: -9px; }
.ticket::after { bottom: -9px; }
.t-body { padding: 18px 22px 20px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.t-label { margin: 0; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tomato-ink); }
.t-title { margin: 0; font-family: var(--font-display); font-weight: 900; font-size: clamp(1.5rem, 2.4vw, 2rem); line-height: 1.15; overflow-wrap: anywhere; }
.t-when { margin: 0; color: var(--ink-2); font-weight: 600; }
.route { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; padding: 0; margin: 10px 0 0; }
.stop { display: inline-block; max-width: 100%; padding: 4px 11px; border-radius: 999px; background: var(--teal-soft); color: var(--teal-ink); font-size: 0.88rem; font-weight: 700; }
.stop-start { background: var(--mustard-soft); color: var(--mustard-ink); }
.route .arrow { color: var(--ink-2); font-weight: 700; }
.shaping { margin: 8px 0 0; color: var(--ink-2); }
.t-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-top: 10px; }
.going { display: flex; align-items: center; gap: 10px; }
.stack { display: inline-flex; }
.stack .stacked { margin-left: -6px; box-shadow: 0 0 0 2px var(--card); }
.stack .stacked:first-child { margin-left: 0; }
.weather { margin: 0; padding: 2px 10px; border-radius: 999px; background: var(--paper-2); color: var(--ink-2); font-weight: 600; }
.weather.wet { background: var(--plum-soft); color: var(--plum-ink); }
.t-open { align-self: flex-start; margin-top: 14px; }
@media (max-width: 575.98px) {
  .ticket { grid-template-columns: 82px 1fr; }
  .ticket::before, .ticket::after { left: 82px; }
  .s-day { font-size: 2.4rem; }
  .body { padding: 16px 16px 18px; }
}
</style>

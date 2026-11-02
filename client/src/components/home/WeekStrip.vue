<script setup>
import { ref, computed } from 'vue'
import { sgParts, sgStartOfDay, sgDateKey, fmtTime, toMs, fromDateKey, DAY } from '../../lib/time.js'
import { areaLabel } from '../../lib/labels.js'
import CategoryIcon from '../brand/CategoryIcon.vue'

// Browse seven-day windows anchored on today, including retained past events and outings.
const props = defineProps({
  listings: { type: Array, default: () => [] },
  hangouts: { type: Array, default: () => [] },
})

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MAX_ROWS = 4

const today = sgStartOfDay(Date.now())
const weekOffset = ref(0)
const dayBounds = computed(() => Array.from({ length: 7 }, (_, i) => {
  const start = today + (weekOffset.value * 7 + i) * DAY
  return { start, end: start + DAY, key: sgDateKey(start), p: sgParts(start) }
}))
const weekTitle = computed(() => weekOffset.value === 0 ? 'This week around you'
  : weekOffset.value === -1 ? 'Last week around you'
    : weekOffset.value === 1 ? 'Next week around you' : 'Events around you')
const weekRange = computed(() => {
  const first = dayBounds.value[0].p, last = dayBounds.value[6].p
  const month = p => MONTHS[p.month - 1].slice(0, 3)
  if (first.year !== last.year) return `${first.day} ${month(first)} ${first.year} – ${last.day} ${month(last)} ${last.year}`
  return `${first.day}${first.month !== last.month ? ` ${month(first)}` : ''}–${last.day} ${month(last)} ${last.year}`
})

// "6–11 pm" when both ends share am/pm, otherwise "6 pm–2 am".
function span(startMs, endMs) {
  const a = fmtTime(startMs), b = fmtTime(endMs)
  const [an, as] = a.split(' '), [, bs] = b.split(' ')
  return as === bs ? `${an}–${b}` : `${a}–${b}`
}
const shortDay = (ms) => WEEKDAYS[sgParts(ms).weekday].slice(0, 3)
const tillText = (key) => {
  const p = sgParts(fromDateKey(key))
  return `till ${p.day} ${MONTHS[p.month - 1].slice(0, 3)}`
}

// A deal counts for a day only when it is tied to that day: a partial days-of-week list, or a window that starts or ends then.
function dealOn(l, d) {
  const v = l.validity
  if (!v) return false
  if (v.dateFrom && d.key < v.dateFrom) return false
  if (v.dateTo && d.key > v.dateTo) return false
  if (Array.isArray(v.daysOfWeek) && v.daysOfWeek.length && v.daysOfWeek.length <= 3) return v.daysOfWeek.includes(CODES[d.p.weekday])
  return v.dateFrom === d.key || v.dateTo === d.key
}

const days = computed(() => dayBounds.value.map((d, i) => {
  const items = []
  for (const h of props.hangouts) {
    const s = h.lockedSlot
    if (s && s.start < d.end && s.end > d.start) {
      items.push({ id: `h-${h.id}`, kind: 'mine', icon: 'hangout', title: h.title, to: `/h/${h.id}`, meta: `${shortDay(s.start)} ${span(s.start, s.end)} · Your jio` })
    }
  }
  for (const l of props.listings) {
    if (l.type === 'hangout' || l.type === 'event') {
      const s = toMs(l.startsAt), e = toMs(l.endsAt)
      if (!(s < d.end && e > d.start)) continue
      // A long run (a months-long pop-up) only marks its opening and closing days, like evergreen deals.
      const long = e - s > 3 * DAY
      const opens = sgDateKey(s) === d.key, closes = sgDateKey(e - 1) === d.key
      if (long && !opens && !closes) continue
      const where = l.area ? areaLabel(l.area) : l.address
      const meta = long ? `${opens ? 'Opens' : 'Last day'}, ${fmtTime(opens ? s : e)} · ${where}` : `${shortDay(s)} ${span(s, e)} · ${where}`
      items.push(l.type === 'hangout'
        ? { id: l.id, kind: 'jio', icon: 'hangout', title: l.title, to: `/o/${l.hangoutId}`, meta }
        : { id: l.id, kind: 'event', icon: 'event', title: l.title, to: { path: '/discover', query: { q: l.title } }, meta })
    } else if (l.type === 'deal' && dealOn(l, d)) {
      const parts = [l.merchant, areaLabel(l.area), l.validity?.dateTo ? tillText(l.validity.dateTo) : ''].filter(Boolean)
      items.push({ id: l.id, kind: 'deal', icon: 'deal', title: l.title, to: { path: '/discover', query: { q: l.title } }, meta: parts.join(' · ') })
    }
  }
  const mine = items.some((x) => x.kind === 'mine')
  const kinds = ['jio', 'event', 'deal'].filter((k) => items.some((x) => x.kind === k))
  const long = `${WEEKDAYS[d.p.weekday]} ${d.p.day} ${MONTHS[d.p.month - 1]}`
  const count = items.length
  const isToday = d.start === today, past = d.start < today
  const label = `${isToday ? 'Today, ' : past ? 'Past, ' : ''}${long}, ${count ? `${count} ${count === 1 ? 'thing' : 'things'} on${mine ? ', including your jio' : ''}` : 'nothing on'}`
  return { ...d, i, items, mine, kinds, label, long, isToday, past, wd: WEEKDAYS[d.p.weekday].slice(0, 3) }
}))

const picked = ref(null)
const activeIndex = computed(() => picked.value ?? (days.value[0].items.length ? 0 : Math.max(0, days.value.findIndex((d) => d.items.length))))
const active = computed(() => days.value[activeIndex.value])
const rows = computed(() => active.value.items.slice(0, MAX_ROWS))
const more = computed(() => active.value.items.length - rows.value.length)
const anything = computed(() => days.value.some((d) => d.items.length))
const KIND_LABEL = { jio: 'Open Jio', event: 'Event', deal: 'Deal' }

function changeWeek(offset) {
  weekOffset.value += offset
  picked.value = null
}
function returnToToday() {
  weekOffset.value = 0
  picked.value = 0
}
</script>

<template>
  <section class="week" aria-labelledby="week-title">
    <div class="week-head">
      <h2 id="week-title" class="sec-title">{{ weekTitle }}</h2>
      <RouterLink to="/discover" class="small fw-bold">See all in Discover</RouterLink>
    </div>

    <div class="week-toolbar">
      <p class="week-range tnum" role="status" aria-live="polite" aria-atomic="true">{{ weekRange }}</p>
      <div class="week-controls" role="group" aria-label="Browse weeks">
        <button type="button" class="btn btn-ghost btn-sm today-btn" :disabled="weekOffset === 0 && active.isToday" @click="returnToToday">Today</button>
        <button type="button" class="week-arrow" aria-label="Previous week" title="Previous week" @click="changeWeek(-1)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button type="button" class="week-arrow" aria-label="Next week" title="Next week" @click="changeWeek(1)">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m10 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </div>

    <div class="strip">
      <button
        v-for="d in days"
        :key="d.key"
        type="button"
        class="day"
        :class="{ mine: d.mine, sel: d.i === activeIndex, today: d.isToday, past: d.past }"
        :aria-pressed="d.i === activeIndex"
        :aria-current="d.isToday ? 'date' : undefined"
        :aria-label="d.label"
        @click="picked = d.i"
      >
        <span class="d-wd" aria-hidden="true">{{ d.wd }}</span>
        <span class="d-num tnum" aria-hidden="true">{{ d.p.day }}</span>
        <span v-if="d.past" class="d-past" aria-hidden="true">Past</span>
        <span class="d-dots" aria-hidden="true">
          <CategoryIcon v-if="d.mine" name="hangout" :size="16" class="d-ico" />
          <i v-for="k in d.kinds" :key="k" class="dot" :class="'dot-' + k"></i>
        </span>
      </button>
    </div>

    <p class="legend small">
      <span><i class="dot dot-jio"></i> Open Jio</span>
      <span><i class="dot dot-event"></i> Event</span>
      <span><i class="dot dot-deal"></i> Deal on that day</span>
      <span><i class="dot dot-mine"></i> Day you have a jio</span>
    </p>

    <div class="day-list" aria-live="polite">
      <h3 class="dl-title">{{ active.isToday ? 'Today' : active.long }}</h3>
      <ul v-if="rows.length" class="rows">
        <li v-for="r in rows" :key="r.id">
          <RouterLink :to="r.to" class="item" :class="'r-' + r.kind">
            <span class="r-ico" aria-hidden="true"><CategoryIcon :name="r.icon" :size="20" /></span>
            <span class="r-text">
              <span class="r-title">{{ r.title }}</span>
              <span class="r-meta small tnum">{{ r.meta }}</span>
            </span>
            <span class="r-kind small">{{ r.kind === 'mine' ? 'Your jio' : KIND_LABEL[r.kind] }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="quiet">{{ anything ? 'Nothing on this day. Try another one.' : weekOffset < 0 ? 'No saved events for this week. Try another week.' : 'Nothing listed for this week yet. Check Discover for ideas.' }}</p>
      <p v-if="more > 0" class="small mb-0"><RouterLink to="/discover">{{ more }} more in Discover</RouterLink></p>
    </div>
  </section>
</template>

<style scoped>
.week { margin-bottom: 32px; }
.week-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.sec-title { font-size: 1.25rem; margin: 0; }
.week-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.week-range { margin: 0; color: var(--ink-2); font-size: .9rem; font-weight: 600; }
.week-controls { display: flex; align-items: center; gap: 6px; }
.today-btn { margin-right: 2px; }
.week-arrow { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--line-control); border-radius: 12px; background: var(--card); color: var(--ink); cursor: pointer; }
.week-arrow:hover { background: var(--paper-2); border-color: var(--ink-2); }
.week-arrow:active { transform: translateY(1px); }
.week-arrow:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 84px;
  padding: 8px 2px 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick), transform var(--oj-t-feedback);
}
.day:hover { border-color: var(--line-strong); }
.day:active { transform: scale(0.97); }
.day.sel { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.day.mine { background: var(--tomato); border-color: var(--tomato); color: var(--on-accent); }
.day.mine.sel { border-color: var(--ink); }
.day.past { background: var(--paper-2); color: var(--ink-2); }
.day.mine.past { background: var(--tomato-soft); border-color: var(--line-strong); }
.day.past.sel { border-color: var(--ink); }
.day.past .d-wd { opacity: 1; }
.day.past .d-ico { color: var(--tomato-ink); }
.d-past { font-size: .7rem; line-height: 1.2; color: var(--ink-2); }
.d-wd { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8; }
.d-num { font-family: var(--font-display); font-weight: 900; font-size: 1.5rem; line-height: 1.1; }
.today:not(.mine) .d-num { color: var(--tomato-ink); }
.d-dots { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 16px; margin-top: auto; }
.d-ico { color: var(--on-accent); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; vertical-align: baseline; }
.dot-jio { background: var(--tomato); }
.dot-event { background: var(--plum); }
.dot-deal { background: var(--mustard); }
.dot-mine { background: var(--tomato); border-radius: 3px; }
.mine .dot { box-shadow: 0 0 0 1.5px var(--card); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 10px 0 14px; color: var(--ink-2); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.dl-title { font-size: 1rem; margin: 0 0 8px; color: var(--ink-2); }
.rows { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 8px; }
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  text-decoration: none;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick);
}
.item:hover { border-color: var(--line-strong); box-shadow: var(--shadow-soft); color: var(--ink); }
.r-ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 12px; }
.r-jio .r-ico, .r-mine .r-ico { background: var(--tomato-soft); color: var(--tomato-ink); }
.r-event .r-ico { background: var(--plum-soft); color: var(--plum-ink); }
.r-deal .r-ico { background: var(--mustard-soft); color: var(--mustard-ink); }
.r-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.r-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-meta { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-kind { flex: none; font-weight: 700; color: var(--ink-2); }
.quiet { color: var(--ink-2); margin: 0; }
@media (max-width: 575.98px) {
  .strip { gap: 4px; }
  .day { min-height: 76px; border-radius: 12px; }
  .d-num { font-size: 1.25rem; }
  .d-wd { font-size: 0.68rem; letter-spacing: 0.02em; }
  .r-kind { display: none; }
}
</style>

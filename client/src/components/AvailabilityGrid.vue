<script setup>
// Availability editor and group overlap view, in 30-minute slots.
// Editing: tap, click or Enter toggles one slot. Dragging applies the current mode (Paint free or Erase)
// to every slot it crosses. On touch, dragging only paints while "Drag to paint" is on, so normal
// swipes still scroll the page. Phones show one day at a time; wider screens show the whole range.
// Read-only mode with `counts` shades each slot by how many people are free.
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { fromDateKey, fmtDay, fmtTime, fmtDuration, MIN } from '../lib/time.js'

const props = defineProps({
  days: { type: Array, required: true }, // date keys
  modelValue: { type: Array, default: () => [] }, // [{start,end}] ms
  fromHour: { type: Number, default: 8 },
  toHour: { type: Number, default: 24 },
  readonly: { type: Boolean, default: false },
  counts: { type: Array, default: null }, // [{day, cells:[{start,count}]}]
  total: { type: Number, default: 1 },
  highlight: { type: Object, default: null }, // {start,end}
  label: { type: String, default: 'Availability' },
})
const emit = defineEmits(['update:modelValue'])
const SLOT = 30 * MIN

const rows = computed(() => {
  const out = []
  for (let m = props.fromHour * 60; m < props.toHour * 60; m += 30) out.push(m)
  return out
})
const dayStarts = computed(() => props.days.map(fromDateKey))

// Narrow screens show a single day.
const narrow = ref(false)
let mq = null
const onMq = () => (narrow.value = !!mq?.matches)
onMounted(() => {
  mq = window.matchMedia('(max-width: 767.98px)')
  onMq()
  mq.addEventListener('change', onMq)
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))
const activeDay = ref(0)
const shownDays = computed(() => (narrow.value ? [dayStarts.value[activeDay.value] ?? dayStarts.value[0]] : dayStarts.value))

const selected = computed(() => {
  const set = new Set()
  for (const iv of props.modelValue) {
    for (const d of dayStarts.value) {
      for (const m of rows.value) {
        const s = d + m * MIN
        if (iv.start <= s && iv.end >= s + SLOT) set.add(s)
      }
    }
  }
  return set
})
const countAt = computed(() => {
  const map = new Map()
  for (const d of props.counts || []) for (const c of d.cells) map.set(c.start, c.count)
  return map
})
const markedOn = (d) => rows.value.reduce((n, m) => n + (selected.value.has(d + m * MIN) ? 30 : 0), 0)

function toIntervals(set) {
  const starts = [...set].sort((a, b) => a - b)
  const out = []
  for (const s of starts) {
    const last = out[out.length - 1]
    if (last && last.end === s) last.end = s + SLOT
    else out.push({ start: s, end: s + SLOT })
  }
  return out
}

// Undo keeps the previous selections made in this session.
const history = ref([])
function snapshot() {
  history.value.push(props.modelValue.map((i) => ({ ...i })))
  if (history.value.length > 40) history.value.shift()
}
function undo() {
  const prev = history.value.pop()
  if (!prev) return
  emit('update:modelValue', prev)
  announce('Undone')
}

const status = ref('')
let statusTimer = null
function announce(text) {
  status.value = ''
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => (status.value = text), 30)
}

function apply(cells, on) {
  const set = new Set(selected.value)
  for (const c of cells) on ? set.add(c) : set.delete(c)
  emit('update:modelValue', toIntervals(set))
}

// Painting
const mode = ref('paint') // paint | erase
const touchPaint = ref(false)
let drag = null // { start, last, moved, cells:Set }
let suppressClick = false

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('[data-s]')
  return el ? Number(el.dataset.s) : null
}
function onDown(e) {
  if (props.readonly) return
  const s = Number(e.target.closest('[data-s]')?.dataset.s)
  if (!s) return
  if (e.pointerType === 'touch' && !touchPaint.value) return
  if (e.pointerType !== 'touch') e.preventDefault()
  drag = { start: s, last: s, moved: false, cells: new Set([s]), el: e.currentTarget }
}
function onMove(e) {
  if (!drag) return
  const s = cellFromPoint(e.clientX, e.clientY)
  if (!s || s === drag.last) return
  if (!drag.moved) {
    drag.moved = true
    drag.el.setPointerCapture?.(e.pointerId)
    snapshot()
  }
  // Fast moves skip slots, so fill everything between the last slot and this one on the same day.
  const sameDay = Math.floor((s + 8 * 3600e3) / 864e5) === Math.floor((drag.last + 8 * 3600e3) / 864e5)
  if (sameDay) {
    const [a, b] = s > drag.last ? [drag.last, s] : [s, drag.last]
    for (let t = a; t <= b; t += SLOT) drag.cells.add(t)
  } else drag.cells.add(s)
  drag.last = s
  apply([...drag.cells], mode.value === 'paint')
}
function onUp() {
  if (!drag) return
  if (drag.moved) {
    // A drag can still end in a click on the last slot; ignore that one.
    suppressClick = true
    setTimeout(() => (suppressClick = false), 0)
    announce(`${mode.value === 'paint' ? 'Marked' : 'Cleared'} ${fmtDuration(drag.cells.size * 30)}`)
  }
  drag = null
}
function onClick(s) {
  if (props.readonly) return
  if (suppressClick) {
    suppressClick = false
    return
  }
  snapshot()
  const on = !selected.value.has(s)
  apply([s], on)
  announce(`${slotName(s)} ${on ? 'marked free' : 'cleared'}`)
}

// Presets apply to the shown day on phones and to every day on wider screens.
const presets = [
  { key: 'class', label: 'After class', from: 16, to: 22 },
  { key: 'eve', label: 'Evenings', from: 18, to: 23 },
  { key: 'day', label: 'All day', from: 10, to: 22 },
]
const hourText = (h) => (h === 12 ? '12 pm' : h === 24 || h === 0 ? '12 am' : h > 12 ? `${h - 12} pm` : `${h} am`)
const presetScope = computed(() => (narrow.value ? fmtDay(shownDays.value[0]) : 'every day'))
function fillPreset(p) {
  snapshot()
  const cells = []
  for (const d of shownDays.value) for (const m of rows.value) if (m >= p.from * 60 && m < p.to * 60) cells.push(d + m * MIN)
  apply(cells, true)
  announce(`${p.label} marked free on ${presetScope.value}`)
}
function clearShown() {
  snapshot()
  apply(shownDays.value.flatMap((d) => rows.value.map((m) => d + m * MIN)), false)
  announce(`Cleared ${presetScope.value}`)
}

// Add a range by form, for anyone who prefers not to paint.
const rangeDay = ref(0)
const rangeFrom = ref((props.fromHour + 10) * 60)
const rangeTo = ref((props.fromHour + 13) * 60)
const timeOptions = computed(() => [...rows.value, props.toHour * 60])
const minText = (m) => hourText(Math.floor(m / 60)).replace(/^(\d+)/, (h) => (m % 60 ? `${h}:30` : h))
function addRange() {
  if (rangeTo.value <= rangeFrom.value) return announce('The end time must be after the start time')
  snapshot()
  const d = dayStarts.value[rangeDay.value]
  const cells = rows.value.filter((m) => m >= rangeFrom.value && m < rangeTo.value).map((m) => d + m * MIN)
  apply(cells, true)
  announce(`${fmtDay(d)}, ${minText(rangeFrom.value)} to ${minText(rangeTo.value)} marked free`)
}

// Keyboard: one slot is in the tab order; arrows move between slots and days.
const focusS = ref(null)
const firstS = computed(() => shownDays.value[0] + rows.value[0] * MIN)
const tabS = computed(() => (focusS.value != null && shownDays.value.some((d) => focusS.value >= d && focusS.value < d + 864e5) ? focusS.value : firstS.value))
const root = ref(null)
async function focusCell(s) {
  focusS.value = s
  await nextTick()
  root.value?.querySelector(`[data-s="${s}"]`)?.focus()
}
function onKey(e) {
  const s = Number(e.target.dataset?.s)
  if (!s || props.readonly) return
  const dayIdx = dayStarts.value.findIndex((d) => s >= d && s < d + 864e5)
  const d = dayStarts.value[dayIdx]
  const m = (s - d) / MIN
  const first = rows.value[0]
  const last = rows.value[rows.value.length - 1]
  let target = null
  if (e.key === 'ArrowDown') target = m < last ? s + SLOT : null
  else if (e.key === 'ArrowUp') target = m > first ? s - SLOT : null
  else if (e.key === 'Home') target = d + first * MIN
  else if (e.key === 'End') target = d + last * MIN
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const ni = dayIdx + (e.key === 'ArrowRight' ? 1 : -1)
    if (ni >= 0 && ni < dayStarts.value.length) {
      target = dayStarts.value[ni] + m * MIN
      if (narrow.value) activeDay.value = ni
    }
  } else return
  e.preventDefault()
  if (target) focusCell(target)
}

function slotName(s) {
  return `${fmtDay(s)}, ${fmtTime(s)} to ${fmtTime(s + SLOT)}`
}
function cellLabel(s) {
  return `${slotName(s)}, ${selected.value.has(s) ? 'free, press to clear' : 'not marked, press to mark free'}`
}
function heatStyle(s) {
  const c = countAt.value.get(s) || 0
  if (!c) return null
  const pct = Math.round((c / Math.max(1, props.total)) * 100)
  return { background: `color-mix(in srgb, var(--teal) ${Math.max(16, pct)}%, var(--card))` }
}
const inHighlight = (s) => props.highlight && s >= props.highlight.start && s < props.highlight.end
const hourLabel = (m) => hourText(m / 60)
const rowTime = (m) => minText(m)
</script>

<template>
  <div ref="root" class="avail" :class="{ readonly, narrow }">
    <template v-if="!readonly">
      <div class="toolbar">
        <div class="seg" role="radiogroup" aria-label="Drag mode">
          <button type="button" role="radio" :aria-checked="mode === 'paint'" :class="{ on: mode === 'paint' }" @click="mode = 'paint'">Paint free</button>
          <button type="button" role="radio" :aria-checked="mode === 'erase'" :class="{ on: mode === 'erase' }" @click="mode = 'erase'">Erase</button>
        </div>
        <button v-if="narrow" type="button" class="btn btn-sm" :class="touchPaint ? 'btn-teal' : 'btn-secondary'" :aria-pressed="touchPaint" @click="touchPaint = !touchPaint">
          {{ touchPaint ? 'Painting on' : 'Drag to paint' }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm ms-auto undo" :disabled="!history.length" aria-label="Undo" @click="undo">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span class="u-txt" aria-hidden="true">Undo</span>
        </button>
      </div>
      <p v-if="narrow && touchPaint" class="hint small">Drag down the list to {{ mode === 'paint' ? 'mark' : 'clear' }} slots. Turn this off to scroll.</p>
    </template>

    <div v-if="narrow" class="daypicker" role="tablist" aria-label="Day">
      <button
        v-for="(d, i) in dayStarts"
        :key="d"
        type="button"
        role="tab"
        class="dp"
        :class="{ on: i === activeDay }"
        :aria-selected="i === activeDay"
        @click="activeDay = i"
      >
        <span class="dp-name">{{ fmtDay(d).split(' ')[0] }}</span>
        <span class="dp-date tnum">{{ fmtDay(d).split(' ').slice(1).join(' ') }}</span>
        <span v-if="!readonly" class="dp-mark tnum" :class="{ has: markedOn(d) }">{{ markedOn(d) ? fmtDuration(markedOn(d)) : 'None' }}</span>
      </button>
    </div>

    <div v-if="!readonly" class="presets">
      <span class="small muted">Fill {{ presetScope }}:</span>
      <button v-for="p in presets" :key="p.key" type="button" class="chip" @click="fillPreset(p)">
        {{ p.label }} <span class="muted fw-normal">{{ hourText(p.from) }} to {{ hourText(p.to) }}</span>
      </button>
      <button type="button" class="chip" @click="clearShown">Clear</button>
    </div>

    <!-- Phone: one day as a list of slots -->
    <div
      v-if="narrow"
      class="list"
      :class="{ painting: touchPaint }"
      role="group"
      :aria-label="`${label}, ${fmtDay(shownDays[0])}`"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @keydown="onKey"
    >
      <template v-for="m in rows" :key="m">
        <div class="lrow" :class="{ hour: m % 60 === 0 }">
          <span class="ltime tnum" aria-hidden="true">{{ rowTime(m) }}</span>
          <button
            v-if="!readonly"
            type="button"
            class="lcell oj-slot"
            :class="{ on: selected.has(shownDays[0] + m * MIN), hl: inHighlight(shownDays[0] + m * MIN) }"
            :data-s="shownDays[0] + m * MIN"
            :aria-pressed="selected.has(shownDays[0] + m * MIN)"
            :aria-label="cellLabel(shownDays[0] + m * MIN)"
            :tabindex="tabS === shownDays[0] + m * MIN ? 0 : -1"
            @click="onClick(shownDays[0] + m * MIN)"
            @focus="focusS = shownDays[0] + m * MIN"
          >
            <span class="state" aria-hidden="true">
              <svg v-if="selected.has(shownDays[0] + m * MIN)" viewBox="0 0 16 16" width="14" height="14"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {{ selected.has(shownDays[0] + m * MIN) ? 'Free' : '' }}
            </span>
          </button>
          <div v-else class="lcell heat" :class="{ hl: inHighlight(shownDays[0] + m * MIN) }" :style="heatStyle(shownDays[0] + m * MIN)">
            <span class="state tnum">{{ countAt.get(shownDays[0] + m * MIN) || 0 }} of {{ total }} free</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Wider screens: every day side by side -->
    <div v-else class="grid-wrap">
      <div
        class="grid"
        role="group"
        :aria-label="label"
        :style="{ '--cols': days.length }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @keydown="onKey"
      >
        <div class="corner" aria-hidden="true"></div>
        <div v-for="d in dayStarts" :key="'h' + d" class="day-head" aria-hidden="true">
          <span class="dh-name">{{ fmtDay(d).split(' ')[0] }}</span>
          <span class="dh-date tnum">{{ fmtDay(d).split(' ').slice(1).join(' ') }}</span>
        </div>
        <template v-for="m in rows" :key="m">
          <div class="time tnum" :class="{ hour: m % 60 === 0 }" aria-hidden="true">{{ m % 60 === 0 ? hourLabel(m) : '' }}</div>
          <template v-for="d in dayStarts" :key="d + m">
            <button
              v-if="!readonly"
              type="button"
              class="cell oj-slot"
              :class="{ on: selected.has(d + m * MIN), hour: m % 60 === 0, hl: inHighlight(d + m * MIN) }"
              :data-s="d + m * MIN"
              :aria-pressed="selected.has(d + m * MIN)"
              :aria-label="cellLabel(d + m * MIN)"
              :tabindex="tabS === d + m * MIN ? 0 : -1"
              @click="onClick(d + m * MIN)"
              @focus="focusS = d + m * MIN"
            ></button>
            <div
              v-else
              class="cell heat"
              :class="{ hour: m % 60 === 0, hl: inHighlight(d + m * MIN) }"
              :style="heatStyle(d + m * MIN)"
              :title="`${slotName(d + m * MIN)}: ${countAt.get(d + m * MIN) || 0} of ${total} free`"
            ></div>
          </template>
        </template>
      </div>
    </div>

    <details v-if="!readonly" class="range">
      <summary>Add a time range instead</summary>
      <div class="range-form">
        <div>
          <label for="r-day" class="small muted">Day</label>
          <select id="r-day" v-model.number="rangeDay" class="form-select">
            <option v-for="(d, i) in dayStarts" :key="d" :value="i">{{ fmtDay(d) }}</option>
          </select>
        </div>
        <div>
          <label for="r-from" class="small muted">From</label>
          <select id="r-from" v-model.number="rangeFrom" class="form-select">
            <option v-for="m in timeOptions.slice(0, -1)" :key="m" :value="m">{{ minText(m) }}</option>
          </select>
        </div>
        <div>
          <label for="r-to" class="small muted">To</label>
          <select id="r-to" v-model.number="rangeTo" class="form-select">
            <option v-for="m in timeOptions.slice(1)" :key="m" :value="m">{{ minText(m) }}</option>
          </select>
        </div>
        <button type="button" class="btn btn-secondary" @click="addRange">Add as free</button>
      </div>
    </details>

    <p class="visually-hidden" role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.seg { display: inline-flex; background: var(--paper-2); border-radius: 12px; padding: 3px; }
.seg button {
  border: 0;
  background: none;
  min-height: 36px;
  padding: 4px 12px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--ink-2);
  transition: background-color var(--oj-t-quick), color var(--oj-t-quick);
}
.seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow-soft); }
.narrow .u-txt { display: none; }
.narrow .undo { width: 44px; padding: 0; }
.narrow .toolbar { flex-wrap: nowrap; }
.toolbar .btn, .seg button { white-space: nowrap; }
.narrow .seg button { padding: 4px 10px; }
.hint { color: var(--teal-ink); background: var(--teal-soft); border-radius: 10px; padding: 6px 10px; margin: 0 0 10px; }
.presets { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
.presets .chip { font-size: 0.85rem; white-space: nowrap; flex: none; }
.narrow .presets { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -18px; padding-right: 18px; }
.narrow .presets > .small { flex: none; }

.daypicker { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; margin: 0 -2px 6px; scrollbar-width: none; }
.dp {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 64px;
  padding: 6px 8px 8px;
  border: 1px solid var(--line);
  border-bottom: 3px solid transparent;
  border-radius: 12px;
  background: var(--card);
  color: var(--ink);
  line-height: 1.2;
}
.dp.on { border-bottom-color: var(--tomato); background: var(--tomato-soft); }
.dp-name { font-weight: 800; font-family: var(--font-display); }
.dp-date { font-size: 0.78rem; color: var(--ink-2); }
.dp-mark { font-size: 0.72rem; font-weight: 700; color: var(--ink-2); margin-top: 2px; }
.dp-mark.has { color: var(--teal-ink); }

/* Phone list */
.list { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--card); }
.list.painting { touch-action: none; user-select: none; outline: 2px dashed color-mix(in srgb, var(--teal) 60%, transparent); outline-offset: 2px; }
.lrow { display: grid; grid-template-columns: 76px 1fr; border-top: 1px dashed color-mix(in srgb, var(--line) 70%, transparent); }
.lrow:first-child { border-top: 0; }
.lrow.hour { border-top: 1px solid var(--line); }
.ltime { font-size: 0.8rem; color: var(--ink-2); padding: 0 10px 0 4px; align-self: center; text-align: right; white-space: nowrap; }
.lcell {
  min-height: 44px;
  border: 0;
  border-left: 1px solid var(--line);
  background: var(--card);
  text-align: left;
  padding: 0 12px;
  display: flex;
  align-items: center;
  color: var(--ink);
}
.lcell .state { display: inline-flex; gap: 6px; align-items: center; font-weight: 700; font-size: 0.85rem; }

/* Desktop grid */
.grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; max-height: 560px; overflow-y: auto; border-radius: 12px; }
.grid {
  display: grid;
  grid-template-columns: 52px repeat(var(--cols), minmax(48px, 1fr));
  min-width: calc(52px + var(--cols) * 48px);
  user-select: none;
}
.corner, .day-head { position: sticky; top: 0; z-index: 2; background: var(--card); }
.corner { left: 0; z-index: 3; }
.day-head { display: flex; flex-direction: column; align-items: center; padding: 4px 2px 8px; line-height: 1.15; border-bottom: 1px solid var(--line); }
.dh-name { font-weight: 800; font-family: var(--font-display); font-size: 0.92rem; }
.dh-date { font-size: 0.75rem; color: var(--ink-2); }
.time {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--card);
  font-size: 0.72rem;
  color: var(--ink-2);
  text-align: right;
  padding-right: 8px;
  height: 18px;
  line-height: 1;
}
.time.hour { transform: translateY(-0.2em); }
.cell {
  height: 18px;
  border: 0;
  border-left: 1px solid var(--line);
  border-top: 1px dashed color-mix(in srgb, var(--line) 60%, transparent);
  background: var(--card);
  padding: 0;
  cursor: pointer;
}
.cell.hour { border-top: 1px solid var(--line); }

.oj-slot { transition: background-color var(--oj-t-feedback) linear, color var(--oj-t-feedback) linear; }
.oj-slot:hover { background: var(--teal-soft); }
.oj-slot.on { background: var(--teal); color: var(--on-accent); }
.oj-slot.on:hover { background: color-mix(in srgb, var(--teal) 85%, var(--ink)); }
.cell.on + .cell.on { border-top-color: transparent; }
.hl { box-shadow: inset 3px 0 0 var(--tomato), inset -3px 0 0 var(--tomato); }
.oj-slot:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: -3px; border-radius: 4px; position: relative; z-index: 1; }
.heat { cursor: default; }

.range { margin-top: 12px; }
.range summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; color: var(--ink-2); min-height: 32px; }
.range-form { display: grid; grid-template-columns: 1.4fr 1fr 1fr auto; gap: 8px; align-items: end; padding-top: 6px; }
@media (max-width: 575.98px) {
  .range-form { grid-template-columns: 1fr 1fr; }
  .range-form > div:first-child { grid-column: 1 / -1; }
  .range-form .btn { grid-column: 1 / -1; }
}
</style>

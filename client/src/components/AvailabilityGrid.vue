<script setup>
// Paintable availability grid: one column per day, 30-minute rows.
// Mouse: drag to paint. Touch and keyboard: tap or Space to toggle a cell. Quick-fill presets per day.
// In read-only heatmap mode, `counts` colours each cell by how many people are free.
import { computed, ref, onBeforeUnmount } from 'vue'
import { fromDateKey, fmtDay, MIN } from '../lib/time.js'

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

const rows = computed(() => {
  const out = []
  for (let m = props.fromHour * 60; m < props.toHour * 60; m += 30) out.push(m)
  return out
})
const dayStarts = computed(() => props.days.map(fromDateKey))

const selected = computed(() => {
  const set = new Set()
  for (const iv of props.modelValue) {
    for (const d of dayStarts.value) {
      for (const m of rows.value) {
        const s = d + m * MIN
        if (iv.start <= s && iv.end >= s + 30 * MIN) set.add(s)
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

function toIntervals(set) {
  const starts = [...set].sort((a, b) => a - b)
  const out = []
  for (const s of starts) {
    const last = out[out.length - 1]
    if (last && last.end === s) last.end = s + 30 * MIN
    else out.push({ start: s, end: s + 30 * MIN })
  }
  return out
}

let painting = null
const dragging = ref(false)

function apply(cells, on) {
  const set = new Set(selected.value)
  for (const c of cells) on ? set.add(c) : set.delete(c)
  emit('update:modelValue', toIntervals(set))
}

function onDown(e, s) {
  if (props.readonly) return
  if (e.pointerType === 'touch') return
  e.preventDefault()
  painting = !selected.value.has(s)
  dragging.value = true
  apply([s], painting)
  window.addEventListener('pointerup', stop, { once: true })
}
function onEnter(s) {
  if (!dragging.value || props.readonly) return
  apply([s], painting)
}
function stop() {
  dragging.value = false
  painting = null
}
function onClick(e, s) {
  if (props.readonly) return
  // Mouse paints on pointerdown; clicks from touch or keyboard toggle here.
  if (e.detail === 0 || e.pointerType === 'touch' || lastPointer === 'touch') apply([s], !selected.value.has(s))
}
let lastPointer = 'mouse'
function onPointerType(e) {
  lastPointer = e.pointerType
}
onBeforeUnmount(() => window.removeEventListener('pointerup', stop))

const presets = [
  { key: 'day', label: 'All day', from: 10, to: 22 },
  { key: 'aft', label: 'Afternoon', from: 12, to: 18 },
  { key: 'eve', label: 'Evening', from: 18, to: 23 },
]
function fillDay(d, p) {
  const cells = rows.value.filter((m) => m >= p.from * 60 && m < p.to * 60).map((m) => d + m * MIN)
  apply(cells, true)
}
function clearDay(d) {
  apply(rows.value.map((m) => d + m * MIN), false)
}

function cellStyle(s) {
  if (!props.counts) return null
  const c = countAt.value.get(s) || 0
  if (!c) return null
  const pct = Math.round((c / Math.max(1, props.total)) * 100)
  return { background: `color-mix(in srgb, var(--teal) ${Math.max(18, pct)}%, var(--card))` }
}
function cellLabel(d, m) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  const t = `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 || h === 24 ? 'am' : 'pm'}`
  const s = d + m * MIN
  if (props.counts) return `${fmtDay(d)} ${t}: ${countAt.value.get(s) || 0} of ${props.total} free`
  return `${fmtDay(d)} ${t}: ${selected.value.has(s) ? 'free' : 'not free'}`
}
const inHighlight = (s) => props.highlight && s >= props.highlight.start && s < props.highlight.end
const hourLabel = (m) => {
  const h = m / 60
  return h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`
}
</script>

<template>
  <div class="grid-wrap" :class="{ readonly }">
    <div class="grid" role="grid" :aria-label="label" :style="{ '--cols': days.length }" @pointerdown.capture="onPointerType">
      <div class="corner" aria-hidden="true"></div>
      <div v-for="(d, i) in dayStarts" :key="'h' + d" class="day-head" role="columnheader">
        <span class="dh-name">{{ fmtDay(d).split(' ')[0] }}</span>
        <span class="dh-date">{{ fmtDay(d).split(' ').slice(1).join(' ') }}</span>
        <div v-if="!readonly" class="dropdown-x">
          <details>
            <summary class="fill-btn" :aria-label="`Quick fill ${fmtDay(d)}`">Fill</summary>
            <div class="fill-menu">
              <button v-for="p in presets" :key="p.key" type="button" @click="fillDay(d, p); $event.target.closest('details').open = false">{{ p.label }}</button>
              <button type="button" @click="clearDay(d); $event.target.closest('details').open = false">Clear</button>
            </div>
          </details>
        </div>
        <span v-else class="sr-only-x">{{ days[i] }}</span>
      </div>

      <template v-for="m in rows" :key="m">
        <div class="time" :class="{ hour: m % 60 === 0 }" aria-hidden="true">{{ m % 60 === 0 ? hourLabel(m) : '' }}</div>
        <button
          v-for="d in dayStarts"
          :key="d + m"
          type="button"
          role="gridcell"
          class="cell"
          :class="{ on: !counts && selected.has(d + m * MIN), hour: m % 60 === 0, hl: inHighlight(d + m * MIN) }"
          :style="cellStyle(d + m * MIN)"
          :aria-pressed="counts ? undefined : selected.has(d + m * MIN)"
          :aria-label="cellLabel(d, m)"
          :tabindex="readonly ? -1 : 0"
          :disabled="readonly && !counts"
          @pointerdown="onDown($event, d + m * MIN)"
          @pointerenter="onEnter(d + m * MIN)"
          @click="onClick($event, d + m * MIN)"
        ></button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.grid {
  display: grid;
  grid-template-columns: 46px repeat(var(--cols), minmax(44px, 1fr));
  min-width: calc(46px + var(--cols) * 44px);
  user-select: none;
  touch-action: pan-x pan-y;
}
.corner { position: sticky; top: 0; }
.day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 2px 8px;
  line-height: 1.15;
}
.dh-name { font-weight: 700; font-size: 0.85rem; }
.dh-date { font-size: 0.75rem; color: var(--ink-2); }
.dropdown-x { position: relative; margin-top: 4px; }
details > summary { list-style: none; }
details > summary::-webkit-details-marker { display: none; }
.fill-btn {
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--tomato-ink);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--card);
}
.fill-menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--card);
  border: 1.5px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 110px;
}
.fill-menu button { background: none; border: 0; text-align: left; padding: 6px 8px; border-radius: 6px; font-size: 0.85rem; color: var(--ink); }
.fill-menu button:hover { background: var(--paper-2); }
.time {
  font-size: 0.68rem;
  color: var(--ink-3);
  text-align: right;
  padding-right: 6px;
  transform: translateY(-0.55em);
  height: 15px;
}
.cell {
  height: 15px;
  border: 0;
  border-left: 1px solid var(--line);
  border-top: 1px dashed color-mix(in srgb, var(--line) 60%, transparent);
  background: var(--card);
  padding: 0;
  cursor: pointer;
}
.cell.hour { border-top: 1px solid var(--line); }
.cell:hover { background: var(--mustard-soft); }
.cell.on { background: var(--tomato); }
.cell.on:hover { background: var(--tomato-ink); }
.cell.hl { box-shadow: inset 3px 0 0 var(--ink), inset -3px 0 0 var(--ink); }
.cell:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; border-radius: 0; }
.readonly .cell { cursor: default; }
.readonly .cell:hover { filter: brightness(0.97); }
.sr-only-x { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>

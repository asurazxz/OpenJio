<script setup>
// Example only: four made-up people mark free half-hour slots in turn. Overlap darkens,
// then the best window ranks first. No data is read or written.
import { computed, ref } from 'vue'
import DemoFrame from './DemoFrame.vue'
import { useDemoLoop } from './useDemoLoop.js'

const PLAY_MS = 7000
const TURN_MS = 1150 // one person's turn
const CELL_MS = 70 // stagger between cells inside a turn
const RANK_AT = 5200
const DAYS = ['Fri', 'Sat', 'Sun']
const ROWS = ['2 pm', '', '3 pm', '', '4 pm', '', '5 pm', '']
const DESCRIPTION = 'Example: four people mark free half-hour slots from 2 pm to 6 pm on Friday, Saturday and Sunday. Saturday 2 pm to 6 pm is free for all four, so it ranks first.'

// [dayIndex, slotIndex] pairs; slot 0 is 2 pm, slot 7 is 5:30 pm.
const range = (day, from, to) => Array.from({ length: to - from + 1 }, (_, i) => [day, from + i])
const PEOPLE = [
  { initials: 'ML', tone: 'mustard', cells: [...range(1, 0, 7), ...range(2, 0, 3)] },
  { initials: 'AN', tone: 'plum', cells: [...range(1, 0, 7), ...range(0, 4, 7)] },
  { initials: 'FI', tone: 'teal', cells: [...range(1, 0, 7), ...range(2, 4, 7)] },
  { initials: 'JO', tone: 'tomato', cells: [...range(1, 0, 7), ...range(0, 0, 3)] },
].map((person, i) => ({ ...person, start: 500 + i * TURN_MS }))

const frame = ref(null)
const { t, paused, reduced, toggle, replay } = useDemoLoop(PLAY_MS, frame)

const counts = computed(() => {
  const out = {}
  for (const person of PEOPLE) {
    person.cells.forEach(([day, slot], k) => {
      if (t.value >= person.start + k * CELL_MS) out[`${day}-${slot}`] = (out[`${day}-${slot}`] || 0) + 1
    })
  }
  return out
})
const countAt = (day, slot) => counts.value[`${day}-${slot}`] || 0
const turn = (person) => (t.value >= person.start + TURN_MS ? 'done' : t.value >= person.start ? 'active' : '')
const ranked = computed(() => t.value >= RANK_AT)
</script>

<template>
  <DemoFrame
    ref="frame"
    data-demo="time"
    title="Find a time"
    :description="DESCRIPTION"
    :paused="paused"
    :reduced="reduced"
    @toggle="toggle"
    @replay="replay"
  >
    <div class="time-demo">
      <div class="people">
        <span v-for="person in PEOPLE" :key="person.initials" class="avatar" :class="[person.tone, turn(person)]">{{ person.initials }}</span>
      </div>
      <div class="mini-grid">
        <span class="mini-corner"></span>
        <span v-for="day in DAYS" :key="day" class="mini-day" :class="{ best: ranked && day === 'Sat' }">{{ day }}</span>
        <template v-for="(label, slot) in ROWS" :key="slot">
          <span class="mini-time">{{ label }}</span>
          <span v-for="(day, di) in DAYS" :key="day" class="mini-cell" :data-count="countAt(di, slot)"></span>
        </template>
      </div>
      <div class="result-slot">
        <div v-if="ranked" class="demo-result"><strong>#1</strong> Sat 2 pm – 6 pm · 4 of 4 free</div>
      </div>
    </div>
  </DemoFrame>
</template>

<style scoped>
.people { display: flex; justify-content: center; gap: 8px; margin-bottom: 12px; }
.avatar {
  width: 38px; height: 38px; border-radius: 50%;
  display: grid; place-items: center;
  border: 2px solid var(--card);
  color: var(--ink);
  font-family: var(--font-display); font-size: .78rem; font-weight: 800;
  transition: box-shadow var(--oj-t-quick) var(--ease);
}
.avatar.mustard { background: var(--mustard-soft); }
.avatar.plum { background: var(--plum-soft); }
.avatar.teal { background: var(--teal-soft); }
.avatar.tomato { background: var(--tomato-soft); }
.avatar.active { box-shadow: 0 0 0 3px var(--teal); }
.avatar.done { border-color: var(--teal); }

.mini-grid { display: grid; grid-template-columns: 40px repeat(3, minmax(0, 1fr)); gap: 4px 6px; align-items: center; }
.mini-day { text-align: center; padding-bottom: 4px; border-bottom: 3px solid transparent; font-family: var(--font-display); font-size: .85rem; font-weight: 800; color: var(--ink); transition: border-color var(--oj-t-feedback) linear; }
.mini-day.best { border-bottom-color: var(--tomato); }
.mini-time { text-align: right; font-size: .72rem; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.mini-cell { height: 18px; border-radius: 5px; border: 1px solid var(--line); background: var(--card); transition: background-color var(--oj-t-feedback) linear; }
.mini-cell[data-count="1"] { background: color-mix(in srgb, var(--teal) 28%, var(--card)); border-color: transparent; }
.mini-cell[data-count="2"] { background: color-mix(in srgb, var(--teal) 52%, var(--card)); border-color: transparent; }
.mini-cell[data-count="3"] { background: color-mix(in srgb, var(--teal) 76%, var(--card)); border-color: transparent; }
.mini-cell[data-count="4"] { background: color-mix(in srgb, var(--teal) 85%, var(--ink)); border-color: transparent; }

.result-slot { min-height: 60px; margin-top: 12px; }
.demo-result {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 10px 12px; border-radius: 14px;
  background: var(--teal-soft); color: var(--teal-ink);
  font-weight: 700; font-size: .95rem;
  animation: demo-rise var(--oj-t-standard) var(--ease) both;
}
.demo-result strong { padding: 2px 8px; border-radius: 999px; background: var(--mustard-soft); color: var(--mustard-ink); font-family: var(--font-display); }
@keyframes demo-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>

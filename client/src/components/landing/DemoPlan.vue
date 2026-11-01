<script setup>
// Example only: a three-stop plan builds up one connector at a time, then Keep and Swap votes
// land as stamps and the plan reaches "Ready to confirm". No data is read or written.
import { computed, ref } from 'vue'
import CategoryIcon from '../brand/CategoryIcon.vue'
import DemoFrame from './DemoFrame.vue'
import { useDemoLoop } from './useDemoLoop.js'

const PLAY_MS = 7000
const STOP_GAP_MS = 400
const DRAW_MS = 420
const POP_MS = 220
const VOTING_AT = 1500
const READY_AT = 5600
const STOPS = [
  { title: 'ArtScience Museum', caption: 'Art by the waterfront.', icon: 'museums', tone: 'plum' },
  { title: 'Gardens by the Bay', caption: 'A little fresh air.', icon: 'outdoors', tone: 'teal' },
  { title: 'Satay by the Bay', caption: 'Food and a catch-up.', icon: 'food', tone: 'mustard' },
]
const VOTES = [
  { stop: 0, kind: 'keep', at: 2300 }, { stop: 0, kind: 'keep', at: 2650 }, { stop: 0, kind: 'keep', at: 3000 }, { stop: 0, kind: 'keep', at: 3350 },
  { stop: 1, kind: 'keep', at: 2800 }, { stop: 1, kind: 'keep', at: 3150 }, { stop: 1, kind: 'swap', at: 3500 }, { stop: 1, kind: 'keep', at: 3850 },
  { stop: 2, kind: 'keep', at: 3700 }, { stop: 2, kind: 'keep', at: 4050 }, { stop: 2, kind: 'keep', at: 4400 }, { stop: 2, kind: 'keep', at: 4750 },
]
const DESCRIPTION = 'Example: a three-stop plan with ArtScience Museum, Gardens by the Bay and Satay by the Bay. Each stop collects Keep votes, and one Swap vote lands on Gardens by the Bay. The plan then reads Ready to confirm.'

const frame = ref(null)
const { t, paused, reduced, toggle, replay } = useDemoLoop(PLAY_MS, frame)

const STOP_AT = (i) => 300 + i * STOP_GAP_MS
const drawn = (i) => Math.min(1, Math.max(0, (t.value - (STOP_AT(i) + 250)) / DRAW_MS))
const votes = (i, kind) => VOTES.filter((v) => v.stop === i && v.kind === kind && t.value >= v.at).length
const popping = (i, kind) => VOTES.some((v) => v.stop === i && v.kind === kind && t.value >= v.at && t.value < v.at + POP_MS)
const phase = computed(() => (t.value >= READY_AT ? 'Ready to confirm' : t.value >= VOTING_AT ? 'Voting' : 'Draft'))
const phaseTone = computed(() => (t.value >= READY_AT ? 'ready' : t.value >= VOTING_AT ? 'voting' : 'draft'))
</script>

<template>
  <DemoFrame
    ref="frame"
    data-demo="plan"
    title="Shape the plan"
    :description="DESCRIPTION"
    :paused="paused"
    :reduced="reduced"
    @toggle="toggle"
    @replay="replay"
  >
    <div class="plan-demo">
      <div class="plan-head">
        <span :key="phase" class="demo-phase" :class="phaseTone">{{ phase }}</span>
      </div>
      <ol class="plan-stops">
        <li v-for="(stop, i) in STOPS" :key="stop.title" class="plan-stop" :class="{ shown: t >= STOP_AT(i) }">
          <span class="plan-no" :class="stop.tone">{{ i + 1 }}</span>
          <span v-if="i < STOPS.length - 1" class="plan-link" :style="{ transform: `scaleY(${drawn(i)})` }"></span>
          <div class="plan-card">
            <p class="plan-title"><CategoryIcon :name="stop.icon" :size="16" />{{ stop.title }}</p>
            <p class="plan-caption">{{ stop.caption }}</p>
            <div class="stamps">
              <span class="stamp keep" :class="{ on: votes(i, 'keep') > 0, pop: popping(i, 'keep') }">
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span>Keep</span>
                <span :key="votes(i, 'keep')" class="stamp-count">{{ votes(i, 'keep') }}</span>
              </span>
              <span class="stamp swap" :class="{ on: votes(i, 'swap') > 0, pop: popping(i, 'swap') }">
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M4 7h11l-3-3M16 13H5l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span>Swap</span>
                <span :key="votes(i, 'swap')" class="stamp-count">{{ votes(i, 'swap') }}</span>
              </span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </DemoFrame>
</template>

<style scoped>
.plan-head { display: flex; justify-content: flex-end; margin-bottom: 10px; min-height: 30px; }
.demo-phase {
  display: inline-flex; align-items: center; min-height: 30px; padding: 4px 12px; border-radius: 999px;
  background: var(--card); color: var(--ink-2); border: 1px solid var(--line);
  font-family: var(--font-display); font-size: .85rem; font-weight: 800;
  animation: demo-rise var(--oj-t-standard) var(--ease) both;
}
.demo-phase.voting { background: var(--mustard-soft); color: var(--mustard-ink); border-color: transparent; }
.demo-phase.ready { background: var(--teal-soft); color: var(--teal-ink); border-color: transparent; }

.plan-stops { list-style: none; padding: 0; margin: 0; }
.plan-stop { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 14px; padding-bottom: 18px; opacity: 0; transform: translateY(8px); transition: opacity var(--oj-t-standard) var(--ease), transform var(--oj-t-standard) var(--ease); }
.plan-stop.shown { opacity: 1; transform: none; }
.plan-stop:last-child { padding-bottom: 0; }
.plan-no { position: relative; z-index: 1; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-family: var(--font-display); font-weight: 900; }
.plan-no.plum { background: var(--plum-soft); color: var(--plum-ink); }
.plan-no.teal { background: var(--teal-soft); color: var(--teal-ink); }
.plan-no.mustard { background: var(--mustard-soft); color: var(--mustard-ink); }
.plan-link { position: absolute; left: 16px; top: 42px; bottom: 0; width: 3px; border-radius: 2px; background: var(--teal); transform-origin: top; }
.plan-card { min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); }
.plan-title { display: flex; align-items: center; gap: 6px; margin: 0; font-family: var(--font-display); font-size: .95rem; font-weight: 800; color: var(--ink); }
.plan-caption { margin: 2px 0 8px; font-size: .82rem; color: var(--ink-2); }
.stamps { display: flex; flex-wrap: wrap; gap: 8px; }

.stamp {
  display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 3px 8px;
  border-radius: 10px; border: 2px solid var(--line); background: var(--card); color: var(--ink-2);
  font-family: var(--font-display); font-size: .82rem; font-weight: 800;
}
.stamp.keep.on { background: var(--teal-soft); border-color: var(--teal); border-style: dashed; color: var(--teal-ink); transform: rotate(-1deg); }
.stamp.swap.on { background: var(--plum-soft); border-color: var(--plum); border-style: dashed; color: var(--plum-ink); transform: rotate(-1deg); }
.stamp.pop { animation: demo-stamp var(--oj-t-stamp) var(--oj-ease-stamp) both; }
.stamp-count {
  min-width: 1.5em; padding: 0 6px; border-radius: 999px; text-align: center;
  font-family: var(--oj-font-body); font-size: .8rem; font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, currentColor 16%, transparent);
  animation: demo-tick var(--oj-t-quick) var(--ease) both;
}
@keyframes demo-stamp {
  0% { opacity: .55; transform: rotate(-6deg) scale(.84); }
  75% { opacity: 1; transform: rotate(2deg) scale(1.045); }
  100% { opacity: 1; transform: rotate(-1deg) scale(1); }
}
@keyframes demo-tick { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
@keyframes demo-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>

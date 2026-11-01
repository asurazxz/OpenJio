<script setup>
// Example only: someone joining later types a departure, a route estimate appears and the weather
// chip lands. Labelled as an estimate; nothing is calculated or sent.
import { computed, ref } from 'vue'
import DemoFrame from './DemoFrame.vue'
import { useDemoLoop } from './useDemoLoop.js'

const PLAY_MS = 4000
const TEXT = 'Leaving Bugis at 4:30 pm'
const TYPE_AT = 300
const TYPE_MS = 1200
const TRACK_AT = 1700
const TRACK_MS = 1300
const RESULT_AT = 3100
const WEATHER_AT = 3500
const DESCRIPTION = 'Example: someone joining later leaves Bugis at 4:30 pm. The estimate has them reach the second stop around 4:52 pm, with 38 minutes together, in fair weather at 31 degrees. This is an estimate, not a live route.'

const frame = ref(null)
const { t, paused, reduced, toggle, replay } = useDemoLoop(PLAY_MS, frame)

const clamp01 = (n) => Math.min(1, Math.max(0, n))
const typed = computed(() => TEXT.slice(0, Math.round(clamp01((t.value - TYPE_AT) / TYPE_MS) * TEXT.length)))
const progress = computed(() => clamp01((t.value - TRACK_AT) / TRACK_MS))
</script>

<template>
  <DemoFrame
    ref="frame"
    data-demo="go"
    title="On the day"
    :description="DESCRIPTION"
    :paused="paused"
    :reduced="reduced"
    @toggle="toggle"
    @replay="replay"
  >
    <div class="go-demo">
      <p class="go-kicker">Join later</p>
      <div class="go-field">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
        <span class="go-typed">{{ typed }}</span>
      </div>
      <div class="go-track">
        <span class="go-node">Bugis</span>
        <span class="go-line"><span class="go-dot" :style="{ left: progress * 100 + '%' }"></span></span>
        <span class="go-node">Stop 2</span>
      </div>
      <div class="result-slot">
        <p v-if="t >= RESULT_AT" class="demo-result">You’ll reach Stop 2, Gardens by the Bay, around 4:52 pm, with 38 min together.</p>
      </div>
      <div class="go-meta">
        <span v-if="t >= WEATHER_AT" class="go-weather">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          Fair, 31°
        </span>
        <span class="go-note">Example estimate, not a live route.</span>
      </div>
    </div>
  </DemoFrame>
</template>

<style scoped>
.go-demo { display: grid; gap: 12px; }
.go-kicker { margin: 0; font-family: var(--font-display); font-size: 1rem; font-weight: 800; color: var(--ink); }
.go-field { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--line-control); background: var(--card); color: var(--ink); }
.go-field svg { flex: none; color: var(--teal-ink); }
.go-typed { font-weight: 600; font-size: .95rem; white-space: nowrap; overflow: hidden; }
.go-track { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: .8rem; font-weight: 700; color: var(--ink-2); }
.go-node { white-space: nowrap; }
.go-line { position: relative; height: 4px; border-radius: 2px; background: var(--line-strong); }
.go-dot { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--teal); border: 2px solid var(--card); }
.result-slot { min-height: 96px; }
.demo-result {
  margin: 0; padding: 12px; border-radius: 14px;
  background: var(--teal-soft); color: var(--teal-ink);
  font-weight: 700; font-size: .95rem; line-height: 1.45;
  animation: demo-rise var(--oj-t-standard) var(--ease) both;
}
.go-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 30px; }
.go-weather { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--mustard-soft); color: var(--mustard-ink); font-size: .85rem; font-weight: 700; animation: demo-rise var(--oj-t-standard) var(--ease) both; }
.go-note { font-size: .78rem; color: var(--ink-2); }
@keyframes demo-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>

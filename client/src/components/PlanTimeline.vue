<script setup>
// Colour-coded itinerary timeline: numbered stops joined by travel legs.
// Legs draw once when the timeline first appears; reordering slides stops into place.
// Actions per stop come in through the `actions` slot.
import { fmtTime, fmtDuration } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE } from '../lib/labels.js'
import CategoryIcon from './brand/CategoryIcon.vue'

defineProps({
  stops: { type: Array, required: true },
  start: { type: Object, default: null },
  issues: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: -1 },
  now: { type: Number, default: null },
})
defineEmits(['focus'])

const TONES = ['orange', 'teal', 'mango', 'pink']
const tone = (i) => TONES[i % TONES.length]
const modeText = (m) => (m === 'walk' ? 'walk' : 'by MRT or bus')
const hoursUnverified = (l) => l.type === 'place' && !l.openingHours
const icon = (l) => (l.kind === 'meal' ? 'food' : (l.interests || [])[0] || l.type)
</script>

<template>
  <div class="tl-wrap">
    <p v-if="start" class="tl-start">
      <span class="node start" aria-hidden="true"></span>
      <span class="small muted">Start around <strong>{{ start.label }}</strong></span>
    </p>
    <TransitionGroup tag="ol" name="tl" class="tl">
      <li
        v-for="(s, i) in stops"
        :key="s.id || s.listingId"
        class="stop"
        :class="['t-' + tone(i), { active: activeIndex === i, bad: issues.some((x) => x.index === i), past: now && s.end < now }]"
      >
        <div class="leg">
          <span class="leg-line" aria-hidden="true"></span>
          <span class="leg-txt small">
            <CategoryIcon :name="s.travelMode === 'walk' ? 'walk' : 'transit'" :size="16" />
            <span class="tnum">About {{ fmtDuration(s.travelMins) }} {{ modeText(s.travelMode) }}</span>
            <span v-if="s.travelEstimate" class="est">estimate</span>
            <span v-if="s.waitMins > 0" class="muted tnum">, {{ fmtDuration(s.waitMins) }} spare before it starts</span>
          </span>
        </div>
        <div class="row-stop">
          <span class="node tnum" aria-hidden="true">{{ i + 1 }}</span>
          <article class="stop-card" :aria-label="`Stop ${i + 1}: ${s.listing.title}`" @mouseenter="$emit('focus', i)" @focusin="$emit('focus', i)">
            <div class="stop-head">
              <span class="cover" aria-hidden="true"><CategoryIcon :name="icon(s.listing)" :size="22" /></span>
              <div class="min-w-0">
                <p class="stop-time tnum">{{ fmtTime(s.start) }} to {{ fmtTime(s.end) }} <span class="muted fw-normal">({{ fmtDuration(Math.round((s.end - s.start) / 60000)) }})</span></p>
                <h4 class="stop-title">{{ s.listing.title }}</h4>
              </div>
              <span class="tag ms-auto" :class="TYPE_TONE[s.listing.type]">{{ s.listing.kind === 'meal' ? 'Meal' : TYPE_LABEL[s.listing.type] }}</span>
            </div>
            <p v-if="s.listing.dealText" class="deal">{{ s.listing.dealText }}<span v-if="s.listing.conditions?.length" class="muted fw-normal">. {{ s.listing.conditions.join(', ') }}</span></p>
            <p class="small muted m-0">{{ s.listing.address }}<template v-if="s.listing.priceText">. {{ s.listing.priceText }}</template></p>
            <p v-if="s.why" class="why small m-0">{{ s.why }}</p>
            <p v-if="hoursUnverified(s.listing)" class="m-0"><span class="tag tag-mustard">Hours not verified</span></p>
            <p v-for="iss in issues.filter((x) => x.index === i)" :key="iss.type" class="issue small m-0" role="alert">{{ iss.message }}</p>
            <slot name="actions" :stop="s" :index="i" />
          </article>
        </div>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.tl-wrap { position: relative; }
.tl { list-style: none; padding: 0; margin: 0; position: relative; }
.tl-start { position: relative; padding-left: 44px; margin: 0; min-height: 28px; display: flex; align-items: center; }
.node.start { position: absolute; left: 8px; top: 4px; width: 20px; height: 20px; border-radius: 50%; background: var(--paper); border: 5px solid var(--ink); }
.stop {
  --c: var(--oj-primary);
  --c-soft: var(--tomato-soft);
  position: relative;
}
.t-teal { --c: var(--oj-teal); --c-soft: var(--teal-soft); }
.t-mango { --c: var(--oj-mango); --c-soft: var(--mustard-soft); }
.t-pink { --c: var(--oj-pink); --c-soft: var(--plum-soft); }
.leg { position: relative; padding-left: 44px; min-height: 40px; display: flex; align-items: center; }
.leg-line {
  position: absolute;
  left: 17px;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 3px;
  background: repeating-linear-gradient(to bottom, var(--c) 0 6px, transparent 6px 11px);
  transform-origin: top;
  animation: leg-draw var(--oj-t-story) var(--oj-ease-out) both;
}
.stop:nth-child(2) .leg-line { animation-delay: 80ms; }
.stop:nth-child(3) .leg-line { animation-delay: 160ms; }
.stop:nth-child(4) .leg-line { animation-delay: 240ms; }
.stop:nth-child(n + 5) .leg-line { animation-delay: 320ms; }
@keyframes leg-draw { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.leg-txt { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--ink-2); font-weight: 600; }
.est { font-size: 0.72rem; font-weight: 700; padding: 0 7px; border-radius: 999px; background: var(--paper-2); color: var(--ink-2); }
.row-stop { position: relative; padding-left: 44px; }
.node {
  position: absolute;
  left: 0;
  top: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c);
  color: var(--on-accent);
  border: 3px solid var(--paper);
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1rem;
  z-index: 1;
  box-shadow: 0 2px 6px rgba(var(--oj-shadow-rgb), 0.12);
}
.stop-card {
  display: grid;
  gap: 6px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: 14px 16px;
  transition: border-color var(--oj-t-quick), box-shadow var(--oj-t-quick) var(--ease);
}
.stop.active .stop-card { border-color: var(--c); box-shadow: var(--shadow-pop); }
.stop.bad .stop-card { border-color: var(--danger); }
.stop.past { opacity: 0.6; }
.stop-head { display: flex; align-items: flex-start; gap: 10px; }
.cover { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--c-soft); color: var(--ink); }
.min-w-0 { min-width: 0; }
.stop-time { margin: 0; font-weight: 700; font-size: 0.88rem; color: var(--ink-2); }
.stop-title { font-family: var(--font-display); font-weight: 800; font-size: 1.15rem; margin: 2px 0 0; }
.deal { margin: 0; font-weight: 700; color: var(--tomato-ink); font-size: 0.92rem; }
.why { color: var(--ink-2); font-style: normal; }
.why::before { content: 'Why: '; font-weight: 700; color: var(--ink); }
.issue { color: var(--danger); font-weight: 600; }
.tl-move { transition: transform var(--oj-t-standard) var(--ease); }
.tl-enter-active { transition: opacity var(--oj-t-standard) var(--ease); }
.tl-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .leg-line { animation: none; }
}
</style>

<script setup>
// Read-only timeline of stops with travel legs. Actions per stop come in through the `actions` slot.
import { fmtTime, fmtDuration } from '../lib/time.js'
import { TYPE_LABEL, TYPE_TONE } from '../lib/labels.js'

defineProps({
  stops: { type: Array, required: true },
  start: { type: Object, default: null },
  issues: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: -1 },
  now: { type: Number, default: null },
})
defineEmits(['focus'])

const mode = (m) => (m === 'walk' ? 'walk' : 'by transit')
</script>

<template>
  <ol class="tl">
    <li v-if="start" class="tl-start">
      <span class="node start" aria-hidden="true"></span>
      <span class="small muted">Start around <strong>{{ start.label }}</strong></span>
    </li>
    <template v-for="(s, i) in stops" :key="s.id || s.listingId">
      <li class="leg" aria-hidden="false">
        <span class="leg-line" aria-hidden="true"></span>
        <span class="leg-txt small muted">
          {{ fmtDuration(s.travelMins) }} {{ mode(s.travelMode) }}<template v-if="s.travelEstimate"> (estimate)</template>
          <template v-if="s.waitMins > 0"> · {{ fmtDuration(s.waitMins) }} spare before it starts</template>
        </span>
      </li>
      <li class="stop" :class="{ active: activeIndex === i, bad: issues.some((x) => x.index === i), past: now && s.end < now }">
        <span class="node" aria-hidden="true">{{ i + 1 }}</span>
        <div class="stop-card" @mouseenter="$emit('focus', i)" @focusin="$emit('focus', i)">
          <div class="stop-head">
            <p class="stop-time">{{ fmtTime(s.start) }} to {{ fmtTime(s.end) }}</p>
            <span class="tag" :class="TYPE_TONE[s.listing.type]">{{ s.listing.kind === 'meal' ? 'Meal' : TYPE_LABEL[s.listing.type] }}</span>
          </div>
          <h4 class="stop-title">{{ s.listing.title }}</h4>
          <p v-if="s.listing.dealText" class="deal">{{ s.listing.dealText }}<span v-if="s.listing.conditions?.length" class="muted"> · {{ s.listing.conditions.join(', ') }}</span></p>
          <p class="small muted m-0">{{ s.listing.address }}<template v-if="s.listing.priceText"> · {{ s.listing.priceText }}</template></p>
          <p v-for="iss in issues.filter((x) => x.index === i)" :key="iss.type" class="issue small m-0" role="alert">{{ iss.message }}</p>
          <slot name="actions" :stop="s" :index="i" />
        </div>
      </li>
    </template>
  </ol>
</template>

<style scoped>
.tl { list-style: none; padding: 0; margin: 0; position: relative; }
.tl li { position: relative; padding-left: 40px; }
.node {
  position: absolute;
  left: 2px;
  top: 14px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--tomato);
  color: var(--on-accent);
  border: 1.5px solid var(--line-strong);
  font-weight: 700;
  font-size: 0.85rem;
  z-index: 1;
}
.tl-start { padding-bottom: 2px; min-height: 28px; display: flex; align-items: center; }
.node.start { top: 4px; width: 20px; height: 20px; left: 6px; background: var(--paper); border: 5px solid var(--ink); }
.leg { min-height: 34px; display: flex; align-items: center; }
.leg-line { position: absolute; left: 15px; top: 0; bottom: 0; border-left: 2.5px dotted var(--ink-3); }
.stop-card {
  background: var(--card);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
  transition: border-color 0.12s;
}
.stop.active .stop-card { border-color: var(--line-strong); box-shadow: var(--shadow-pop); }
.stop.bad .stop-card { border-color: var(--danger); }
.stop.past { opacity: 0.6; }
.stop-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.stop-time { margin: 0; font-weight: 700; font-size: 0.9rem; color: var(--ink-2); }
.stop-title { font-family: var(--font-display); font-weight: 650; font-size: 1.12rem; margin: 4px 0 2px; }
.deal { margin: 0 0 2px; font-weight: 650; color: var(--tomato-ink); font-size: 0.92rem; }
.issue { color: var(--danger); font-weight: 600; margin-top: 4px !important; }
</style>

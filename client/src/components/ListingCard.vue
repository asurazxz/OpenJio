<script setup>
import { computed } from 'vue'
import { TYPE_LABEL, TYPE_TONE, interestLabel, areaLabel, sourceLine } from '../lib/labels.js'
import { fmtRange, fmtAge, toMs, fmtDateKey } from '../lib/time.js'

const props = defineProps({
  listing: { type: Object, required: true },
  km: { type: Number, default: null },
  available: { type: Boolean, default: null },
  compact: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
})
defineEmits(['add', 'open'])

const l = computed(() => props.listing)
const when = computed(() => {
  if (l.value.type === 'event' || l.value.type === 'hangout') return fmtRange(toMs(l.value.startsAt), toMs(l.value.endsAt))
  if (l.value.type === 'deal' && l.value.validity?.dateTo) return `Until ${fmtDateKey(l.value.validity.dateTo)}`
  return null
})
const age = computed(() => {
  const t = toMs(l.value.source?.verifiedAt || l.value.source?.retrievedAt)
  return t ? fmtAge(t) : null
})
const spots = computed(() => (l.value.type === 'hangout' && l.value.capacity ? Math.max(0, l.value.capacity - l.value.memberCount) : null))
</script>

<template>
  <article class="listing" :class="{ compact, active }">
    <div class="top">
      <span class="tag" :class="TYPE_TONE[l.type]">{{ TYPE_LABEL[l.type] }}</span>
      <span class="small muted">{{ areaLabel(l.area) }}<template v-if="km != null"> · {{ km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km' }}</template></span>
    </div>
    <h3 class="title">
      <button type="button" class="title-btn" @click="$emit('open', l)">{{ l.title }}</button>
    </h3>
    <p v-if="l.type === 'deal' && l.dealText" class="deal-text">{{ l.dealText }}<span v-if="l.merchant" class="muted"> at {{ l.merchant }}</span></p>
    <p v-if="!compact" class="summary">{{ l.summary }}</p>
    <p v-if="when" class="when">{{ when }}</p>
    <div class="meta">
      <span v-for="i in (l.interests || []).slice(0, 2)" :key="i" class="tag">{{ interestLabel(i) }}</span>
      <span v-if="l.priceText" class="tag">{{ l.priceText }}</span>
      <span v-if="available === true" class="tag tag-teal">Fits your time</span>
      <span v-else-if="available === false" class="tag">Not at that time</span>
      <span v-if="spots != null" class="tag" :class="spots ? 'tag-tomato' : ''">{{ spots ? `${spots} spots left` : 'Full' }}</span>
      <span v-if="l.type !== 'hangout' && !l.openingHours && l.type !== 'event'" class="tag">Hours unknown</span>
    </div>
    <div class="foot">
      <span class="source small muted" :title="l.source?.url || ''">{{ sourceLine(l) }}<template v-if="age && l.source?.kind !== 'curated'"> · checked {{ age }}</template></span>
      <slot name="actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('add', l)">
          {{ l.type === 'hangout' ? 'View' : 'Add to plan' }}
        </button>
      </slot>
    </div>
  </article>
</template>

<style scoped>
.listing {
  background: var(--card);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s var(--ease);
}
.listing:hover { border-color: var(--line-strong); }
.listing.active { border-color: var(--line-strong); box-shadow: var(--shadow-pop); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.title { font-size: 1.12rem; margin: 2px 0 0; }
.title-btn {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.title-btn:hover { text-decoration: underline; text-underline-offset: 3px; }
.deal-text { margin: 0; font-weight: 650; color: var(--tomato-ink); }
.summary { margin: 0; color: var(--ink-2); font-size: 0.93rem; }
.when { margin: 0; font-size: 0.9rem; font-weight: 600; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; }
.foot { margin-top: auto; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.compact { padding: 12px 14px; }
</style>

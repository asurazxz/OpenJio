<script setup>
// One compact row in Discover's "in this area" list. Hover or focus lights its pin; click selects it.
import { computed } from 'vue'
import { keyFact, listingIcon } from '../../lib/algo/discover.js'
import CategoryIcon from '../brand/CategoryIcon.vue'

const props = defineProps({
  listing: { type: Object, required: true },
  km: { type: Number, default: null },
  hot: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
})
defineEmits(['select', 'hover'])

const fact = computed(() => keyFact(props.listing))
const distance = computed(() => (props.km == null ? '' : props.km < 1 ? `${Math.round(props.km * 1000)} m` : `${props.km.toFixed(1)} km`))
</script>

<template>
  <li :id="`row-${listing.id}`">
    <button
      type="button"
      class="result-row"
      :class="[`ty-${listing.type}`, { hot, selected }]"
      :aria-current="selected ? 'true' : undefined"
      @click="$emit('select', listing.id)"
      @mouseenter="$emit('hover', listing.id)"
      @mouseleave="$emit('hover', null)"
      @focus="$emit('hover', listing.id)"
      @blur="$emit('hover', null)"
    >
      <span class="tile" aria-hidden="true"><CategoryIcon :name="listingIcon(listing)" :size="19" /></span>
      <span class="text">
        <span class="title">{{ listing.title }}</span>
        <span class="fact tnum">{{ fact }}<template v-if="distance"> · {{ distance }}</template></span>
      </span>
    </button>
  </li>
</template>

<style scoped>
.result-row {
  --tint-ink: var(--teal-ink);
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  text-align: left;
  color: var(--ink);
  background: none;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color var(--oj-t-quick);
}
.ty-deal { --tint-ink: var(--mustard-ink); }
.ty-event { --tint-ink: var(--plum-ink); }
.ty-hangout { --tint-ink: var(--tomato-ink); }
.result-row:hover, .result-row.hot { background: var(--paper-2); }
.result-row.selected { background: var(--tomato-soft); }
.result-row:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: -3px; }
.tile { flex: none; display: grid; place-items: center; width: 22px; color: var(--tint-ink); }
.text { min-width: 0; display: grid; gap: 2px; }
.title { font-weight: 700; font-size: 0.92rem; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.fact { font-size: 0.8rem; color: var(--ink-2); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

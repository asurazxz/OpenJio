<script setup>
// The card docked at the bottom of the Discover map for the selected pin or row.
import { computed } from 'vue'
import { keyFact, metaLine, listingIcon } from '../../lib/algo/discover.js'
import { TYPE_LABEL, areaLabel } from '../../lib/labels.js'
import CategoryIcon from '../brand/CategoryIcon.vue'

const props = defineProps({ listing: { type: Object, required: true } })
defineEmits(['close', 'details', 'add'])

const fact = computed(() => keyFact(props.listing))
const meta = computed(() => metaLine(props.listing) || areaLabel(props.listing.area))
</script>

<template>
  <section class="preview" :class="`ty-${listing.type}`" :aria-label="`Selected: ${listing.title}`">
    <span class="tile" aria-hidden="true"><CategoryIcon :name="listingIcon(listing)" :size="20" /></span>
    <div class="body">
      <h3 class="title">{{ listing.title }}</h3>
      <p class="meta"><span class="kind">{{ fact || TYPE_LABEL[listing.type] }}</span> · {{ meta }}</p>
    </div>
    <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('details', listing)">Details</button>
        <!-- Auto-extracted listings are view-only, so they link to their source instead. -->
        <a v-if="listing.autoPublished" :href="listing.source?.url" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">View post</a>
        <button v-else type="button" class="btn btn-primary btn-sm" @click="$emit('add', listing)">{{ listing.type === 'hangout' ? 'View' : 'Suggest for a jio' }}</button>
    </div>
    <button type="button" class="close" aria-label="Close preview" @click="$emit('close')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    </button>
  </section>
</template>

<style scoped>
.preview {
  --tint: var(--teal-soft);
  --tint-ink: var(--teal-ink);
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 40px 8px 8px;
  background: var(--card);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}
.ty-deal { --tint: var(--mustard-soft); --tint-ink: var(--mustard-ink); }
.ty-event { --tint: var(--plum-soft); --tint-ink: var(--plum-ink); }
.ty-hangout { --tint: var(--tomato-soft); --tint-ink: var(--tomato-ink); }
.tile { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--tint); color: var(--tint-ink); }
.body { min-width: 0; }
.body p { margin: 0; }
.kind { color: var(--tint-ink); font-weight: 700; }
.title { margin: 0; font: 700 0.95rem/1.25 var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { font-size: 0.8rem; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 4px; }
/* Narrow maps: the actions drop under the text. */
@container preview (max-width: 380px) {
  .preview { grid-template-columns: auto minmax(0, 1fr); }
  .actions { grid-column: 1 / -1; justify-content: flex-end; }
}
.close {
  position: absolute; top: 50%; right: 4px; translate: 0 -50%;
  display: grid; place-items: center; width: 32px; height: 32px;
  border: 0; border-radius: 50%; background: none; color: var(--ink-2); cursor: pointer;
}
.close:hover { background: var(--paper-2); color: var(--ink); }
.close:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 1px; }
</style>

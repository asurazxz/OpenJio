<script setup>
// Keep or Swap vote control styled as a rubber stamp. The pop plays only when the
// selection changes to this stamp, never on re-render.
import { ref, watch } from 'vue'

const props = defineProps({
  kind: { type: String, required: true }, // keep | swap
  selected: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
})
defineEmits(['press'])

const pop = ref(false)
watch(
  () => props.selected,
  (now, before) => {
    if (now && !before) {
      pop.value = false
      requestAnimationFrame(() => (pop.value = true))
    }
  },
)
</script>

<template>
  <button
    type="button"
    class="vote-stamp"
    :class="[kind, { 'is-selected': selected, pop }]"
    :aria-pressed="selected"
    :disabled="disabled"
    :aria-label="label || undefined"
    @click="$emit('press')"
    @animationend="pop = false"
  >
    <svg v-if="kind === 'keep'" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <svg v-else viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 7h11l-3-3M16 13H5l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="word">{{ kind === 'keep' ? 'Keep' : 'Swap' }}</span>
    <span class="count tnum">{{ count }}</span>
  </button>
</template>

<style scoped>
.vote-stamp {
  --c: var(--oj-teal);
  --c-ink: var(--oj-teal-ink);
  --c-soft: var(--oj-teal-soft);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0.3rem 0.8rem;
  border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--card);
  color: var(--ink-2);
  font-family: var(--oj-font-heading);
  font-weight: 800;
  font-size: 0.92rem;
  cursor: pointer;
  transition: background-color var(--oj-t-feedback), border-color var(--oj-t-feedback), color var(--oj-t-feedback);
}
.vote-stamp.swap { --c: var(--oj-pink); --c-ink: var(--oj-pink-ink); --c-soft: var(--oj-pink-soft); }
.vote-stamp:hover:not(:disabled) { border-color: var(--c); color: var(--c-ink); }
.vote-stamp.is-selected {
  background: var(--c-soft);
  border-color: var(--c);
  border-style: dashed;
  color: var(--c-ink);
  transform: rotate(-1deg);
}
.vote-stamp.pop { animation: oj-stamp-in var(--oj-t-stamp) var(--oj-ease-stamp) both; }
.count {
  min-width: 1.5em;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  font-family: var(--oj-font-body);
  font-size: 0.8rem;
  text-align: center;
}
.vote-stamp:disabled { opacity: 0.55; cursor: not-allowed; }
@keyframes oj-stamp-in {
  0% { opacity: 0.55; transform: rotate(-6deg) scale(0.84); }
  75% { opacity: 1; transform: rotate(2deg) scale(1.045); }
  100% { opacity: 1; transform: rotate(-1deg) scale(1); }
}
</style>

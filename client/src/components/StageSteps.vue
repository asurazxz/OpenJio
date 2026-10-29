<script setup>
import { computed } from 'vue'
import { STAGES } from '../lib/labels.js'

const props = defineProps({
  stage: { type: String, required: true },
  skipTime: { type: Boolean, default: false },
})
const steps = computed(() => (props.skipTime ? STAGES.slice(1) : STAGES))
const currentIndex = computed(() => {
  const i = steps.value.findIndex((s) => s.key === props.stage)
  return i === -1 ? steps.value.length : i
})
</script>

<template>
  <ol class="steps" aria-label="Progress">
    <li
      v-for="(s, i) in steps"
      :key="s.key"
      :class="{ done: i < currentIndex, current: i === currentIndex }"
      :aria-current="i === currentIndex ? 'step' : undefined"
    >
      <span class="dot" aria-hidden="true">
        <svg v-if="i < currentIndex" viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="lbl">{{ s.label }}</span>
    </li>
  </ol>
</template>

<style scoped>
.steps { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0; flex-wrap: wrap; }
li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 5px;
  border-radius: 999px;
  background: var(--paper-2);
  color: var(--ink-3);
  font-size: 0.85rem;
  font-weight: 650;
}
.dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.78rem;
  background: var(--card);
  border: 1.5px solid var(--line);
}
li.done { color: var(--ink-2); }
li.done .dot { background: var(--teal); color: var(--on-accent); border-color: var(--teal); }
li.current { background: var(--ink); color: var(--paper); }
li.current .dot { background: var(--mustard); color: var(--ink); border-color: var(--mustard); }
</style>

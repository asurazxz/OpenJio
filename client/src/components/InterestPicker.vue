<script setup>
// Multi-select chips. v-model is an array of slugs, or a weights object when `weighted` is set
// (tap cycles 0 -> like (0.6) -> love (1) -> 0).
import { INTERESTS } from '../data/seed-listings.js'

const props = defineProps({
  modelValue: { type: [Array, Object], required: true },
  weighted: { type: Boolean, default: false },
  max: { type: Number, default: 12 },
  label: { type: String, default: 'Interests' },
})
const emit = defineEmits(['update:modelValue'])

function level(slug) {
  if (props.weighted) return props.modelValue[slug] || 0
  return props.modelValue.includes(slug) ? 1 : 0
}

function toggle(slug) {
  if (props.weighted) {
    const cur = level(slug)
    const next = cur === 0 ? 0.6 : cur < 1 ? 1 : 0
    const out = { ...props.modelValue }
    if (next) out[slug] = next
    else delete out[slug]
    emit('update:modelValue', out)
    return
  }
  const has = props.modelValue.includes(slug)
  if (!has && props.modelValue.length >= props.max) return
  emit('update:modelValue', has ? props.modelValue.filter((s) => s !== slug) : [...props.modelValue, slug])
}
</script>

<template>
  <div class="chip-row" role="group" :aria-label="label">
    <button
      v-for="i in INTERESTS"
      :key="i.slug"
      type="button"
      class="chip"
      :class="{ love: weighted && level(i.slug) === 1, like: weighted && level(i.slug) > 0 && level(i.slug) < 1 }"
      :aria-pressed="level(i.slug) > 0"
      :aria-label="weighted ? `${i.label}: ${level(i.slug) === 1 ? 'love' : level(i.slug) > 0 ? 'like' : 'not set'}` : i.label"
      @click="toggle(i.slug)"
    >
      <span v-if="weighted && level(i.slug) === 1" aria-hidden="true" class="pip">++</span>
      <span v-else-if="weighted && level(i.slug) > 0" aria-hidden="true" class="pip">+</span>
      {{ i.label }}
    </button>
  </div>
</template>

<style scoped>
.chip.like[aria-pressed='true'] { background: var(--mustard-soft); color: var(--ink); border-color: var(--mustard); }
.chip.love[aria-pressed='true'] { background: var(--tomato); color: var(--on-accent); border-color: var(--line-strong); }
.pip { font-weight: 800; font-size: 0.78rem; }
</style>

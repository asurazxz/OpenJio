<script setup>
// Shared chrome for the landing examples: an "Example" label, Pause/Replay controls that match the
// map demo, and a visually hidden text alternative. The animated stage is hidden from assistive tech.
defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  paused: { type: Boolean, default: false },
  reduced: { type: Boolean, default: false },
})
defineEmits(['toggle', 'replay'])
</script>

<template>
  <div class="demo-frame" role="group" :aria-label="'Example: ' + title">
    <div class="demo-bar">
      <span class="demo-tag">Example</span>
      <div v-if="!reduced" class="demo-controls">
        <button type="button" class="demo-btn" :aria-label="(paused ? 'Resume' : 'Pause') + ' the ' + title + ' example'" @click="$emit('toggle')">{{ paused ? 'Resume' : 'Pause' }}</button>
        <button type="button" class="demo-btn" :aria-label="'Replay the ' + title + ' example'" @click="$emit('replay')">Replay</button>
      </div>
    </div>
    <div class="demo-stage" aria-hidden="true">
      <slot />
    </div>
    <p class="visually-hidden">{{ description }}</p>
  </div>
</template>

<style scoped>
.demo-frame { min-width: 0; display: grid; gap: 12px; padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); }
.demo-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; }
.demo-tag { display: inline-flex; align-items: center; min-height: 28px; padding: 2px 10px; border-radius: 999px; background: var(--paper-2); border: 1px solid var(--line); color: var(--ink-2); font-size: .78rem; font-weight: 700; }
.demo-controls { display: flex; gap: 6px; }
.demo-btn { min-height: 44px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line-control); background: var(--card); color: var(--ink); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
.demo-btn:hover { background: var(--paper-2); border-color: var(--line-strong); }
.demo-btn:active { transform: translateY(1px); }
.demo-btn:focus-visible { outline: 3px solid var(--oj-focus); outline-offset: 3px; }
.demo-stage { min-width: 0; padding: 14px; background: var(--paper-2); border-radius: 16px; }
</style>

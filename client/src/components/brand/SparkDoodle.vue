<script setup>
// A few hand-drawn strokes around a focal point. Plays once when shown.
defineProps({ size: { type: Number, default: 40 }, play: { type: Boolean, default: true } })
</script>

<template>
  <svg class="spark" :class="{ play }" :width="size" :height="size" viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke-width="3" stroke-linecap="round">
      <path d="M20 3v7" stroke="var(--oj-primary)" />
      <path d="M33 9l-5 5" stroke="var(--oj-pink)" />
      <path d="M37 22h-7" stroke="var(--oj-mango)" />
      <path d="M7 9l5 5" stroke="var(--oj-primary)" />
      <path d="M3 22h6" stroke="var(--oj-pink)" />
    </g>
  </svg>
</template>

<style scoped>
.spark { overflow: visible; transform-origin: center; }
.spark.play { animation: spark-in var(--oj-t-celebrate) var(--oj-ease-out) both; }
@keyframes spark-in {
  0% { opacity: 0; transform: scale(0.6); }
  60% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
</style>

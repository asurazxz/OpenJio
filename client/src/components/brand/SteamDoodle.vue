<script setup>
// A bowl with three lines of steam. The steam drifts gently unless reduced motion is set.
defineProps({ size: { type: Number, default: 72 } })
</script>

<template>
  <svg class="steam-doodle" :width="size" :height="size" viewBox="0 0 72 72" aria-hidden="true">
    <g class="steam" fill="none" stroke="var(--oj-mango)" stroke-width="3" stroke-linecap="round">
      <path d="M26 30c-3-4 3-7 0-12" />
      <path d="M36 28c-3-4 3-7 0-12" style="animation-delay: -1.2s" />
      <path d="M46 30c-3-4 3-7 0-12" style="animation-delay: -2.4s" />
    </g>
    <path d="M12 38h48a24 22 0 0 1-48 0Z" fill="var(--oj-primary)" />
    <path d="M18 44h36" stroke="var(--oj-bg)" stroke-width="2.5" stroke-linecap="round" opacity=".7" />
    <path d="M28 60h16" stroke="var(--oj-text)" stroke-width="3" stroke-linecap="round" opacity=".25" />
  </svg>
</template>

<style scoped>
.steam path { animation: oj-steam 3.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes oj-steam {
  0%, 100% { opacity: 0.35; transform: translateY(2px); }
  50% { opacity: 0.85; transform: translateY(-4px); }
}
@media (prefers-reduced-motion: reduce) {
  .steam path { animation: none; opacity: 0.7; }
}
</style>

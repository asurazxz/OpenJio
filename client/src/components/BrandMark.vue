<script setup>
defineProps({ size: { type: Number, default: 30 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="brand-mark">
    <rect width="64" height="64" rx="18" fill="var(--tomato)" />
    <path d="M10 44 A22 22 0 0 1 54 44" fill="none" stroke="var(--mustard)" stroke-width="7" stroke-linecap="round" />
    <circle cx="32" cy="34" r="11" fill="none" stroke="var(--paper)" stroke-width="6" />
    <circle cx="32" cy="34" r="3.5" fill="var(--paper)" />
  </svg>
</template>

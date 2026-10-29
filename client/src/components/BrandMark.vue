<script setup>
defineProps({ size: { type: Number, default: 30 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="brand-mark">
    <rect width="64" height="64" rx="18" fill="var(--oj-primary)" />
    <path d="M14 33h36a18 18 0 0 1-36 0Z" fill="var(--oj-bg)" />
    <path d="M22 26c-2-3 2-5 0-9M32 25c-2-3 2-5 0-9M42 26c-2-3 2-5 0-9" fill="none" stroke="var(--oj-bg)" stroke-width="3.2" stroke-linecap="round" />
    <path d="M24 40h16" stroke="var(--oj-primary)" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

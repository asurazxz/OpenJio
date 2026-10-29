<script setup>
defineProps({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  tone: { type: String, default: 'mustard' },
})
</script>

<template>
  <div class="empty" :class="tone">
    <svg class="art" viewBox="0 0 140 72" aria-hidden="true">
      <ellipse cx="70" cy="64" rx="56" ry="5" fill="currentColor" opacity="0.12" />
      <path d="M38 40h64a32 22 0 0 1-64 0Z" fill="currentColor" />
      <path d="M46 46h48" stroke="var(--card)" stroke-width="3" stroke-linecap="round" opacity=".6" />
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.55">
        <path d="M56 32c-3-4 3-7 0-12" /><path d="M70 30c-3-4 3-7 0-12" /><path d="M84 32c-3-4 3-7 0-12" />
      </g>
      <circle cx="18" cy="44" r="9" fill="var(--oj-teal)" opacity=".85" /><path d="M8 64a10 10 0 0 1 20 0" fill="var(--oj-teal)" opacity=".85" />
      <circle cx="122" cy="44" r="9" fill="var(--oj-pink)" opacity=".85" /><path d="M112 64a10 10 0 0 1 20 0" fill="var(--oj-pink)" opacity=".85" />
    </svg>
    <h3>{{ title }}</h3>
    <p v-if="body">{{ body }}</p>
    <div class="actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 32px 20px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.art { width: 140px; height: 72px; margin-bottom: 10px; }
.mustard .art { color: var(--mustard); }
.tomato .art { color: var(--tomato); }
.plum .art { color: var(--plum); }
.teal .art { color: var(--teal); }
h3 { margin: 0 0 6px; }
p { color: var(--ink-2); margin: 0 auto; max-width: 46ch; }
.actions { margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.actions:empty { display: none; }
</style>

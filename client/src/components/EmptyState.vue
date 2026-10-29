<script setup>
defineProps({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  tone: { type: String, default: 'mustard' },
})
</script>

<template>
  <div class="empty" :class="tone">
    <svg class="art" viewBox="0 0 120 60" aria-hidden="true">
      <path d="M8 52 A52 52 0 0 1 112 52" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.35" />
      <path d="M26 52 A34 34 0 0 1 94 52" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.6" />
      <circle cx="60" cy="52" r="12" fill="currentColor" />
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
  border: 1.5px dashed var(--line);
  border-radius: var(--radius);
  background: var(--card);
}
.art { width: 120px; height: 60px; margin-bottom: 8px; }
.mustard .art { color: var(--mustard); }
.tomato .art { color: var(--tomato); }
.teal .art { color: var(--teal); }
h3 { margin: 0 0 6px; }
p { color: var(--ink-2); margin: 0 auto; max-width: 46ch; }
.actions { margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.actions:empty { display: none; }
</style>

<script setup>
// Heading with a strip of washi tape behind its first words. Keep to short headings.
defineProps({
  tag: { type: String, default: 'h2' },
  tone: { type: String, default: 'orange' }, // orange | pink | teal | mango
})
</script>

<template>
  <component :is="tag" class="washi" :class="'tone-' + tone">
    <span class="tape" aria-hidden="true"></span>
    <span class="label"><slot /></span>
  </component>
</template>

<style scoped>
.washi { position: relative; display: inline-block; isolation: isolate; padding: 0 4px; }
.tape {
  position: absolute;
  z-index: -1;
  left: -6px;
  right: -8px;
  bottom: 0.08em;
  height: 0.62em;
  transform: rotate(-1.2deg);
  background: var(--tape);
  opacity: 0.55;
  /* torn ends */
  clip-path: polygon(0 8%, 3% 0, 6% 14%, 9% 2%, 91% 4%, 94% 0, 97% 12%, 100% 6%, 100% 92%, 97% 100%, 94% 86%, 91% 98%, 9% 96%, 6% 100%, 3% 88%, 0 96%);
}
.tone-orange { --tape: var(--oj-primary); }
.tone-pink { --tape: var(--oj-pink); }
.tone-teal { --tape: var(--oj-teal); }
.tone-mango { --tape: var(--oj-mango); }
:global([data-bs-theme='dark']) .washi .tape { opacity: 0.4; }
.label { position: relative; }
</style>

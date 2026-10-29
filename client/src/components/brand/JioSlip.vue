<script setup>
// Invitation slip with a perforated stub. Rises once into place when `rise` is set.
defineProps({
  label: { type: String, default: 'INVITED' },
  tone: { type: String, default: 'orange' }, // orange | teal
  rise: { type: Boolean, default: false },
})
</script>

<template>
  <div class="jio-slip" :class="['tone-' + tone, { rise }]">
    <span class="slip-label">{{ label }}</span>
    <div class="slip-body"><slot /></div>
    <div v-if="$slots.stub" class="slip-stub"><slot name="stub" /></div>
  </div>
</template>

<style scoped>
.jio-slip {
  --tape: var(--oj-primary);
  position: relative;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-pop);
  transform: rotate(-0.6deg);
}
.tone-teal { --tape: var(--oj-teal); }
.slip-label {
  position: absolute;
  top: -12px;
  left: 22px;
  padding: 3px 14px;
  background: color-mix(in srgb, var(--tape) 82%, var(--card));
  color: var(--on-accent);
  font-family: var(--oj-font-heading);
  font-weight: 900;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  transform: rotate(-2.5deg);
  clip-path: polygon(0 10%, 4% 0, 96% 6%, 100% 0, 100% 90%, 96% 100%, 4% 94%, 0 100%);
}
.slip-body { padding: 26px 22px 20px; }
.slip-stub {
  position: relative;
  padding: 16px 22px 20px;
  border-top: 2px dashed var(--line);
}
.slip-stub::before, .slip-stub::after {
  content: '';
  position: absolute;
  top: -11px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--line);
}
.slip-stub::before { left: -11px; clip-path: inset(0 0 0 50%); }
.slip-stub::after { right: -11px; clip-path: inset(0 50% 0 0); }
.rise { animation: slip-rise var(--oj-t-slip) var(--oj-ease-out) both; }
@keyframes slip-rise {
  from { opacity: 0; transform: translateY(14px) rotate(-3deg); }
  to { opacity: 1; transform: translateY(0) rotate(-0.6deg); }
}
</style>

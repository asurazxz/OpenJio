<script setup>
import BrandMark from '../BrandMark.vue'
defineProps({ size: { type: Number, default: 32 }, mark: { type: Boolean, default: true } })
</script>

<template>
  <span class="oj-wordmark" :style="{ '--wm-size': size + 'px' }">
    <BrandMark v-if="mark" :size="size" />
    <span class="txt">Open<span class="jio">Jio</span></span>
  </span>
</template>

<style scoped>
.oj-wordmark { display: inline-flex; align-items: center; gap: calc(var(--wm-size) * 0.3); }
.txt {
  font-family: var(--oj-font-heading);
  font-weight: 900;
  font-size: calc(var(--wm-size) * 0.72);
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--oj-text);
}
.jio { color: var(--oj-primary); }
</style>

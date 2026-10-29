<script setup>
import { useRoute } from 'vue-router'
import { session } from '../api/index.js'

const route = useRoute()
const items = [
  { to: '/', name: 'home', label: 'Plans', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/discover', name: 'discover', label: 'Discover', icon: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5 12 4 4' },
  { to: '/new', name: 'new', label: 'New', icon: 'M12 5v14M5 12h14', primary: true },
  { to: '/profile', name: 'profile', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0' },
]
</script>

<template>
  <nav v-if="session.userId" class="bottom-nav" aria-label="Main">
    <RouterLink v-for="i in items" :key="i.to" :to="i.to" class="tab" :class="{ active: route.name === i.name, primary: i.primary }">
      <span class="ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path :d="i.icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
      <span class="lbl">{{ i.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--card);
  border-top: 1.5px solid var(--line);
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  color: var(--ink-3);
  text-decoration: none;
  font-size: 0.72rem;
  font-weight: 650;
}
.tab.active { color: var(--ink); }
.tab.primary .ico {
  background: var(--tomato);
  color: var(--on-accent);
  border: 1.5px solid var(--line-strong);
  border-radius: 12px;
  width: 40px;
  height: 30px;
  display: grid;
  place-items: center;
}
@media (min-width: 768px) {
  .bottom-nav { display: none; }
}
</style>

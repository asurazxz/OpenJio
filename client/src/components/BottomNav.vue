<script setup>
import { useRoute } from 'vue-router'
import { session } from '../api/index.js'

const route = useRoute()
const items = [
  { to: '/', key: 'home', label: 'Home', icon: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z' },
  { to: '/discover', key: 'discover', label: 'Discover', icon: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5 12 4 4' },
  { to: '/new', key: 'new', label: 'Create', icon: 'M12 6v12M6 12h12', primary: true },
  { to: '/discover?type=hangout', key: 'openjios', label: 'Open jios', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19a5 5 0 0 1 10 0M13.5 15.5A5 5 0 0 1 21 19' },
  { to: '/profile', key: 'profile', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0' },
]

function isActive(key) {
  if (key === 'openjios') return route.name === 'discover' && route.query.type === 'hangout'
  if (key === 'discover') return route.name === 'discover' && route.query.type !== 'hangout'
  return route.name === key
}
</script>

<template>
  <nav v-if="session.userId && !route.meta.bare" class="bottom-nav" aria-label="Main">
    <RouterLink
      v-for="i in items"
      :key="i.key"
      :to="i.to"
      class="tab"
      :class="{ active: isActive(i.key), primary: i.primary }"
      :aria-current="isActive(i.key) ? 'page' : undefined"
    >
      <span class="ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path :d="i.icon" fill="none" stroke="currentColor" :stroke-width="i.primary ? 2.6 : 2" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  background: var(--card);
  border-top: 1px solid var(--line);
  box-shadow: 0 -6px 20px rgba(var(--oj-shadow-rgb), 0.05);
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 48px;
  padding: 4px 0;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 0.74rem;
  font-weight: 700;
  transition: color var(--oj-t-quick);
}
.tab .ico { display: grid; place-items: center; width: 44px; height: 28px; border-radius: 999px; transition: background-color var(--oj-t-quick); }
.tab.active { color: var(--tomato-ink); }
.tab.active .ico { background: var(--tomato-soft); }
.tab.primary .ico {
  width: 52px;
  height: 40px;
  margin-top: -14px;
  background: var(--tomato);
  color: var(--on-accent);
  border-radius: 16px;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--tomato) 35%, transparent);
}
.tab.primary { color: var(--ink); }
.tab:active .ico { transform: scale(0.94); }
@media (min-width: 768px) {
  .bottom-nav { display: none; }
}
</style>

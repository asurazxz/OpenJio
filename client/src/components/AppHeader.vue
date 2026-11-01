<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { session, currentUser, signOut, resetDemo, isDemo } from '../api/index.js'
import { revision } from '../api/store.js'
import { getTheme, setTheme } from '../lib/theme.js'
import OpenJioWordmark from './brand/OpenJioWordmark.vue'
import UserAvatar from './UserAvatar.vue'
import { toast } from '../lib/toast.js'
import { confirmDialog } from '../lib/confirm.js'

const route = useRoute()
const router = useRouter()
const user = computed(() => {
  revision.value
  return session.userId ? currentUser() : null
})
const menuOpen = ref(false)
const menuEl = ref(null)
const theme = ref(getTheme())
const refreshTheme = () => { theme.value = getTheme() }
function startTour() { window.dispatchEvent(new CustomEvent('openjio:tour')) }

function cycleTheme() {
  const order = ['system', 'light', 'dark']
  theme.value = order[(order.indexOf(theme.value) + 1) % order.length]
  setTheme(theme.value)
}
const themeLabel = computed(() => ({ system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' })[theme.value])

function onDoc(e) {
  if (menuOpen.value && menuEl.value && !menuEl.value.contains(e.target)) menuOpen.value = false
}
function onKey(e) {
  if (e.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false
    menuEl.value?.querySelector('.avatar-btn')?.focus()
  }
}
onMounted(() => {
  document.addEventListener('click', onDoc)
  document.addEventListener('keydown', onKey)
  window.addEventListener('openjio:theme-change', refreshTheme)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDoc)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('openjio:theme-change', refreshTheme)
})
watch(() => route.fullPath, () => (menuOpen.value = false))

function switchPerson() {
  router.push({ name: 'signin', query: { next: route.fullPath } })
}
function doSignOut() {
  signOut()
  router.push({ name: 'signin' })
}
async function doReset() {
  if (!(await confirmDialog({ title: 'Reset demo data?', message: 'Everything in this browser goes back to the starting sample, including your plans.', confirmLabel: 'Reset', danger: true }))) return
  resetDemo()
  toast('Demo data reset')
  router.push('/')
}
const allLinks = [
  { to: '/', label: 'Home', key: 'home', auth: true },
  { to: '/discover', label: 'Discover', key: 'discover' },
  { to: '/discover?type=hangout', label: 'Open jios', key: 'openjios' },
  { to: '/how', label: 'How it works', key: 'how' },
]
// Signed-out visitors see the same public links on every page, landing included;
// pages that need an account are left out so no link lands on a sign-in wall.
const links = computed(() => allLinks.filter((l) => !l.auth || session.userId))
function isActive(key) {
  if (key === 'openjios') return route.name === 'discover' && route.query.type === 'hangout'
  if (key === 'discover') return route.name === 'discover' && route.query.type !== 'hangout'
  return route.name === key
}
</script>

<template>
  <header class="app-header">
    <div class="inner">
      <RouterLink to="/" class="brand" aria-label="OpenJio home">
        <OpenJioWordmark :size="32" />
      </RouterLink>

      <nav class="main-nav" aria-label="Main">
        <RouterLink v-for="l in links" :key="l.key" :to="l.to" class="nav-link-x" :class="{ active: isActive(l.key) }" :aria-current="isActive(l.key) ? 'page' : undefined">{{ l.label }}</RouterLink>
      </nav>

      <div class="right">
        <button v-if="user" type="button" class="btn btn-ghost btn-sm tour-trigger" aria-label="Quick tour" title="Quick tour" @click="startTour"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg><span class="d-none d-lg-inline">Quick tour</span></button>
        <RouterLink v-if="user" to="/new" data-tour="nav-create" class="btn btn-primary btn-sm d-none d-md-inline-flex">Create a jio</RouterLink>
        <button type="button" class="btn btn-ghost btn-sm icon-btn" :aria-label="themeLabel" :title="themeLabel" @click="cycleTheme">
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" /></svg>
          <svg v-else-if="theme === 'light'" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor" /><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></g></svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" /></svg>
        </button>

        <div v-if="user" ref="menuEl" class="menu-wrap">
          <button type="button" class="avatar-btn" :aria-expanded="menuOpen" aria-controls="account-links" aria-label="Account menu" @click.stop="menuOpen = !menuOpen">
            <UserAvatar :user="user" :size="36" />
          </button>
          <nav v-if="menuOpen" id="account-links" class="menu card-x pop" aria-label="Account">
            <div class="menu-head">
              <strong>{{ user.name }}</strong>
              <span class="small muted">{{ isDemo ? 'Demo account' : 'Your account' }}</span>
            </div>
            <RouterLink to="/profile" class="menu-item">Profile and interests</RouterLink>
            <RouterLink v-if="user.reviewer" to="/review" class="menu-item">Review listings</RouterLink>
            <button v-if="isDemo" type="button" class="menu-item" @click="switchPerson">Switch person</button>
            <button v-if="isDemo" type="button" class="menu-item" @click="doReset">Reset demo data</button>
            <button type="button" class="menu-item" @click="doSignOut">Sign out</button>
          </nav>
        </div>
        <RouterLink v-else to="/signin" class="btn btn-secondary btn-sm">Sign in</RouterLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: saturate(1.2) blur(8px);
  border-bottom: 1px solid var(--line);
}
.inner {
  max-width: 1200px;
  margin: 0 auto;
  height: var(--header-h);
  padding: 0 var(--gutter);
  display: flex;
  align-items: center;
  gap: 20px;
}
.brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); }
.main-nav { display: none; gap: 4px; }
.nav-link-x {
  padding: 8px 14px;
  border-radius: 999px;
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.95rem;
}
.nav-link-x:hover { color: var(--ink); background: var(--paper-2); }
.nav-link-x.active { color: var(--tomato-ink); background: var(--tomato-soft); }
.right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tour-trigger { min-width: 44px; padding-inline: 8px; }
.icon-btn { width: 44px; height: 44px; min-height: 44px; padding: 0; display: inline-grid; place-items: center; }
.avatar-btn { background: none; border: 0; padding: 0; border-radius: 50%; cursor: pointer; }
.menu-wrap { position: relative; }
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 240px;
  padding: 8px;
  display: flex;
  flex-direction: column;
}
.menu-head { padding: 8px 10px 10px; display: flex; flex-direction: column; border-bottom: 1.5px dashed var(--line); margin-bottom: 6px; }
.menu-item {
  text-align: left;
  background: none;
  border: 0;
  padding: 11px 12px;
  border-radius: 10px;
  color: var(--ink);
  text-decoration: none;
  font-size: 0.95rem;
}
.menu-item:hover { background: var(--paper-2); color: var(--ink); }
@media (min-width: 768px) {
  .main-nav { display: flex; }
}
@media (min-width: 768px) and (max-width: 991.98px) {
  .inner { gap: 10px; }
  .nav-link-x { padding: 8px; font-size: .82rem; }
  .right { gap: 3px; }
}
</style>
